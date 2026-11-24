"""The admin board: every bin's fill, its forecast, the pickup run, and this month's totals."""

from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .forecast import WINDOW_DAYS, forecast, route
from .models import Container, Deposit, DepositLine, DropPoint, LedgerEntry, LedgerReason, Stream
from .points import container_fill_g

STATUS_ORDER = {"due": 0, "soon": 1, "later": 2, "idle": 3}


def local_day_start(day: date, tz: ZoneInfo) -> datetime:
    """Local midnight as a UTC time: stored times are UTC (SQLite keeps them without a zone)."""
    return datetime.combine(day, time.min, tzinfo=tz).astimezone(UTC)


def build_board(db: Session, tz: ZoneInfo, now: datetime) -> dict:
    today = now.astimezone(tz).date()
    streams = {s.key: s for s in db.scalars(select(Stream))}
    points = db.scalars(
        select(DropPoint)
        .where(DropPoint.active)
        .options(selectinload(DropPoint.containers).selectinload(Container.stream))
        .order_by(DropPoint.name)
    ).all()

    # Weight that came into each (point, bin) on each of the last WINDOW_DAYS local days
    since = local_day_start(today - timedelta(days=WINDOW_DAYS - 1), tz)
    daily: dict[tuple[int, str], dict[date, float]] = defaultdict(lambda: defaultdict(float))
    for point_id, key, created, grams in db.execute(
        select(Deposit.point_id, DepositLine.stream_key, Deposit.created_at, DepositLine.weight_g)
        .join(DepositLine, DepositLine.deposit_id == Deposit.id)
        .where(Deposit.created_at >= since)
    ):
        day = (created if created.tzinfo else created.replace(tzinfo=UTC)).astimezone(tz).date()
        daily[(point_id, key)][day] += grams / 1000

    out_points = []
    for p in points:
        bins = []
        for c in p.containers:
            fill_kg = container_fill_g(db, c) / 1000
            fc = forecast(fill_kg, c.capacity_kg, list(daily[(p.id, c.stream_key)].values()), today)
            bins.append(
                {
                    "container_id": c.id,
                    "stream_key": c.stream_key,
                    "stream_name": c.stream.name,
                    "capacity_kg": c.capacity_kg,
                    "fill_kg": round(fill_kg, 1),
                    "fill_ratio": round(min(fill_kg / c.capacity_kg, 9.99), 3) if c.capacity_kg else 1.0,
                    "rate_kg_per_day": round(fc.rate_kg_per_day, 1),
                    "full_on": fc.full_on,
                    "pickup_on": fc.pickup_on,
                    "status": fc.status,
                    "last_pickup_at": c.emptied_at,
                }
            )
        bins.sort(key=lambda b: (STATUS_ORDER[b["status"]], b["pickup_on"] or date.max))
        dates = [b["pickup_on"] for b in bins if b["pickup_on"]]
        out_points.append(
            {
                "id": p.id,
                "name": p.name,
                "address": p.address,
                "lat": p.lat,
                "lng": p.lng,
                "is_demo": p.is_demo,
                "status": bins[0]["status"] if bins else "idle",
                "next_pickup_on": min(dates) if dates else None,
                "bins": bins,
            }
        )
    out_points.sort(key=lambda p: (STATUS_ORDER[p["status"]], p["next_pickup_on"] or date.max, p["name"]))

    # Today's run: every point with a bin due, most urgent first, then nearest neighbour
    due = [p for p in out_points if p["status"] == "due"]
    run = route([(p["id"], (p["lat"], p["lng"])) for p in due])
    by_id = {p["id"]: p for p in due}
    stops = [
        {
            "point_id": pid,
            "name": by_id[pid]["name"],
            "km_from_previous": round(km, 1),
            "bins": [b["stream_key"] for b in by_id[pid]["bins"] if b["status"] == "due"],
        }
        for pid, km in run
    ]

    # Month to date (local calendar month)
    month_start = local_day_start(today.replace(day=1), tz)
    kg_by_stream: dict[str, float] = defaultdict(float)
    for key, grams in db.execute(
        select(DepositLine.stream_key, func.sum(DepositLine.weight_g))
        .join(Deposit, Deposit.id == DepositLine.deposit_id)
        .where(Deposit.created_at >= month_start)
        .group_by(DepositLine.stream_key)
    ):
        kg_by_stream[key] = int(grams) / 1000
    value_sen = sum(kg * streams[k].price_sen_per_kg for k, kg in kg_by_stream.items() if k in streams)
    deposits, residents = db.execute(
        select(func.count(Deposit.id), func.count(func.distinct(Deposit.resident_id))).where(
            Deposit.created_at >= month_start
        )
    ).one()

    def ledger_sum(reason: LedgerReason) -> int:
        q = select(func.coalesce(func.sum(LedgerEntry.delta), 0)).where(
            LedgerEntry.reason == reason, LedgerEntry.created_at >= month_start
        )
        return abs(int(db.scalar(q)))

    return {
        "today": today,
        "is_demo": any(p.is_demo for p in points),
        "points": out_points,
        "run": {"stops": stops, "total_km": round(sum(s["km_from_previous"] for s in stops), 1)},
        "month": {
            "from": today.replace(day=1),
            "kg_by_stream": [
                {"stream_key": k, "stream_name": streams[k].name, "kg": round(kg, 1)}
                for k, kg in sorted(kg_by_stream.items(), key=lambda kv: -kv[1])
                if k in streams
            ],
            "kg_total": round(sum(kg_by_stream.values()), 1),
            "value_sen": round(value_sen),
            "deposits": int(deposits),
            "residents": int(residents),
            "points_issued": ledger_sum(LedgerReason.deposit),
            "points_redeemed": ledger_sum(LedgerReason.redemption),
        },
    }
