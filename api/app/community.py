"""The community page (Phase 7): what everyone recycled together, and what people find confusing.

Everything here is a total over places, bins or items, never a person. The confusion figures come from scans by
signed-in residents (so each person counts once per item) and show a row only once MIN_PEOPLE different people
are in it. Scans carry no location, so "by place" means each resident's usual drop-off point: the one where staff
weighed most of their deposits.
"""

from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .board import local_day_start
from .models import Deposit, DepositLine, DropPoint, Scan, Stream

WEEKS = 8
CONFUSION_DAYS = 90
MIN_PEOPLE = 3
TOP = 8
OTHER = "other"


def usual_points(db: Session) -> dict[int, int]:
    """Each resident's usual drop-off point: where most of their deposits were weighed (ties: the lower id)."""
    best: dict[int, tuple[int, int]] = {}
    for resident, point, n in db.execute(
        select(Deposit.resident_id, Deposit.point_id, func.count())
        .where(Deposit.point_id.is_not(None))
        .group_by(Deposit.resident_id, Deposit.point_id)
    ):
        if resident not in best or (n, -point) > (best[resident][1], -best[resident][0]):
            best[resident] = (point, n)
    return {resident: point for resident, (point, _) in best.items()}


def recycled(db: Session, tz: ZoneInfo, now: datetime) -> dict:
    today = now.astimezone(tz).date()
    month_start = today.replace(day=1)
    last_month_start = (month_start - timedelta(days=1)).replace(day=1)
    week_start = today - timedelta(days=today.weekday())  # Monday
    first_week = week_start - timedelta(weeks=WEEKS - 1)
    since = local_day_start(min(first_week, last_month_start), tz)

    weeks: dict[date, float] = {first_week + timedelta(weeks=i): 0.0 for i in range(WEEKS)}
    by_point: dict[int | None, dict[str, float]] = defaultdict(lambda: {"month": 0.0, "last_month": 0.0})
    by_stream: dict[str, float] = defaultdict(float)
    for point_id, key, created, grams in db.execute(
        select(Deposit.point_id, DepositLine.stream_key, Deposit.created_at, DepositLine.weight_g)
        .join(DepositLine, DepositLine.deposit_id == Deposit.id)
        .where(Deposit.created_at >= since)
    ):
        day = (created if created.tzinfo else created.replace(tzinfo=UTC)).astimezone(tz).date()
        kg = grams / 1000
        monday = day - timedelta(days=day.weekday())
        if monday in weeks:
            weeks[monday] += kg
        if day >= month_start:
            by_point[point_id]["month"] += kg
            by_stream[key] += kg
        elif day >= last_month_start:
            by_point[point_id]["last_month"] += kg

    month_ids = select(Deposit.id).where(Deposit.created_at >= local_day_start(month_start, tz))
    deposits, residents = db.execute(
        select(func.count(Deposit.id), func.count(func.distinct(Deposit.resident_id))).where(Deposit.id.in_(month_ids))
    ).one()
    points = db.scalars(select(DropPoint).where(DropPoint.active).order_by(DropPoint.name)).all()
    streams = {s.key: s for s in db.scalars(select(Stream))}
    places = sorted(
        (
            {"id": p.id, "name": p.name, "kg_month": round(by_point[p.id]["month"], 1),
             "kg_last_month": round(by_point[p.id]["last_month"], 1)}
            for p in points
        ),
        key=lambda x: (-x["kg_month"], x["name"]),
    )  # fmt: skip
    return {
        "today": today,
        "is_demo": any(p.is_demo for p in points),
        "month": {
            "from": month_start,
            "kg_total": round(sum(v["month"] for v in by_point.values()), 1),
            "deposits": int(deposits),
            "residents": int(residents),
            "home_kg": round(by_point[None]["month"], 1),
            "home_kg_last_month": round(by_point[None]["last_month"], 1),
        },
        "weeks": [{"from": w, "kg": round(kg, 1), "partial": w == week_start} for w, kg in weeks.items()],
        "places": places,
        "streams": [
            {"stream_key": k, "stream_name": streams[k].name, "kg_month": round(kg, 1)}
            for k, kg in sorted(by_stream.items(), key=lambda kv: -kv[1])
            if k in streams
        ],
    }


def confusion(db: Session, now: datetime, point_id: int | None) -> dict:
    """What people asked about most, where they and the model disagreed, and how often the item was none of the
    12 kinds the model knows. Rows with fewer than MIN_PEOPLE people are counted but not shown."""
    rows = db.execute(
        select(Scan.user_id, Scan.predicted_class, Scan.unsure, Scan.user_label, Scan.is_demo).where(
            Scan.user_id.is_not(None), Scan.created_at >= now - timedelta(days=CONFUSION_DAYS)
        )
    ).all()
    if point_id is not None:
        usual = usual_points(db)
        rows = [r for r in rows if usual.get(r.user_id) == point_id]

    asked: dict[str, dict] = defaultdict(lambda: {"people": set(), "scans": 0})
    pairs: dict[tuple[str, str], dict] = defaultdict(lambda: {"people": set(), "scans": 0})
    unknown = {"people": set(), "scans": 0}
    for r in rows:
        if r.user_label == OTHER:
            unknown["people"].add(r.user_id)
            unknown["scans"] += 1
            continue
        item = r.user_label or (None if r.unsure else r.predicted_class)  # an unanswered "not sure" says nothing
        if item:
            asked[item]["people"].add(r.user_id)
            asked[item]["scans"] += 1
        if r.user_label and r.user_label != r.predicted_class:
            pair = pairs[(r.predicted_class, r.user_label)]
            pair["people"].add(r.user_id)
            pair["scans"] += 1

    def shown(groups: dict, key_out) -> tuple[list[dict], int]:
        ok = [(k, g) for k, g in groups.items() if len(g["people"]) >= MIN_PEOPLE]
        ok.sort(key=lambda kg: (-len(kg[1]["people"]), -kg[1]["scans"], str(kg[0])))
        return [{**key_out(k), "people": len(g["people"]), "scans": g["scans"]} for k, g in ok[:TOP]], len(
            groups
        ) - len(ok)

    asked_rows, asked_hidden = shown(asked, lambda k: {"item": k})
    pair_rows, pair_hidden = shown(pairs, lambda k: {"model_said": k[0], "people_said": k[1]})
    return {
        "point_id": point_id,
        "days": CONFUSION_DAYS,
        "min_people": MIN_PEOPLE,
        "people": len({r.user_id for r in rows}),
        "scans": len(rows),
        "is_demo": any(r.is_demo for r in rows),
        "asked": asked_rows,
        "disagreements": pair_rows,
        "hidden": asked_hidden + pair_hidden,
        "unknown": (
            {"people": len(unknown["people"]), "scans": unknown["scans"]}
            if len(unknown["people"]) >= MIN_PEOPLE
            else None
        ),
    }
