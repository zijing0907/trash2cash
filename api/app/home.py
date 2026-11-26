"""Home pickups (Phase 6b): a resident with a lot to recycle books a collector, who weighs it at the door.

Points follow the same rule as drop-offs: they are earned only for what staff weigh, here the collector, never for
what the resident estimated. Until a collector takes the request, other collectors see only the area (the
position rounded to about a kilometre), the day and the rough weight, never the address.
"""

import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, selectinload

from .errors import api_error
from .jobs import photo_kind
from .models import Deposit, DepositLine, HomePickup, HomeStatus, LedgerEntry, LedgerReason, Slot, Stream, User
from .points import points_for

MIN_KG = 5.0  # below this, a drop-off point is the better trip
MAX_KG = 500.0
BOOK_AHEAD_DAYS = 14
OPEN_PER_RESIDENT = 2  # requests waiting or taken at once
AREA_DECIMALS = 2  # 0.01 degree is about 1.1 km: enough to plan a route, not enough to find a door

OPEN = (HomeStatus.requested, HomeStatus.taken)


def request_pickup(
    db: Session,
    resident: User,
    *,
    streams: list[str],
    rough_kg: float,
    address: str,
    lat: float,
    lng: float,
    note: str,
    day: date,
    slot: Slot,
    photo: bytes,
    media_dir: Path,
    today: date,
) -> HomePickup:
    keys = list(dict.fromkeys(k.strip() for k in streams if k.strip()))
    known = set(db.scalars(select(Stream.key).where(Stream.key.in_(keys))))
    if not keys or len(known) != len(keys):
        raise api_error(422, "bad_streams", "Choose which bins the items belong in.")
    if not MIN_KG <= rough_kg <= MAX_KG:
        raise api_error(
            422,
            "bad_weight",
            f"Home pickups are for {MIN_KG:g} to {MAX_KG:g} kg. Smaller amounts fit a drop-off point.",
        )
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise api_error(422, "bad_position", "Set where you are on the map.")
    if not today <= day <= today + timedelta(days=BOOK_AHEAD_DAYS):
        raise api_error(422, "bad_day", f"Choose a day from today up to {BOOK_AHEAD_DAYS} days ahead.")
    kind = photo_kind(photo)
    if kind is None:
        raise api_error(422, "not_a_photo", "Add a photo of the items (JPEG, PNG, WebP or HEIC).")
    waiting = db.scalar(
        select(func.count(HomePickup.id)).where(HomePickup.resident_id == resident.id, HomePickup.status.in_(OPEN))
    )
    if waiting >= OPEN_PER_RESIDENT:
        raise api_error(409, "too_many_open", "You already have two pickups booked. Wait for one to be collected.")
    name = f"home-{uuid.uuid4()}{kind[0]}"
    media_dir.mkdir(parents=True, exist_ok=True)
    (media_dir / name).write_bytes(photo)
    req = HomePickup(resident_id=resident.id, streams=keys, rough_kg=rough_kg, address=address.strip(), lat=lat,
                     lng=lng, note=note.strip(), day=day, slot=slot, photo_path=name)  # fmt: skip
    db.add(req)
    db.flush()
    return req


def load(db: Session, request_id: int) -> HomePickup:
    req = db.scalars(
        select(HomePickup)
        .where(HomePickup.id == request_id)
        .options(
            selectinload(HomePickup.resident),
            selectinload(HomePickup.collector),
            selectinload(HomePickup.deposit).selectinload(Deposit.lines),
        )  # fmt: skip
    ).first()
    if req is None:
        raise api_error(404, "pickup_not_found", "Pickup not found.")
    return req


def out(req: HomePickup, full: bool) -> dict:
    """full: the resident, an admin or the collector who took it. Otherwise only the area and the day."""
    d = req.deposit
    base = {
        "id": req.id,
        "status": req.status,
        "streams": req.streams,
        "rough_kg": req.rough_kg,
        "day": req.day,
        "slot": req.slot,
        "created_at": req.created_at,
        "taken_at": req.taken_at,
        "finished_at": req.finished_at,
        "collector": {"id": req.collector.id, "name": req.collector.display_name} if req.collector else None,
        "missed_reason": req.missed_reason,
        "weighed": [{"stream_key": ln.stream_key, "weight_g": ln.weight_g} for ln in d.lines] if d else [],
        "points": d.points if d else None,
    }
    if not full:
        return {**base, "area": [round(req.lat, AREA_DECIMALS), round(req.lng, AREA_DECIMALS)]}
    return {
        **base,
        "area": [round(req.lat, AREA_DECIMALS), round(req.lng, AREA_DECIMALS)],
        "address": req.address,
        "lat": req.lat,
        "lng": req.lng,
        "note": req.note,
        "resident": {"name": req.resident.display_name},
        "has_photo": True,
    }


def cancel(db: Session, req: HomePickup, resident: User) -> None:
    if req.resident_id != resident.id:
        raise api_error(404, "pickup_not_found", "Pickup not found.")
    done = db.execute(
        update(HomePickup)
        .where(HomePickup.id == req.id, HomePickup.status == HomeStatus.requested)
        .values(status=HomeStatus.cancelled, finished_at=datetime.now(UTC))
    ).rowcount
    if not done:
        raise api_error(409, "already_taken", "A collector has already taken this pickup. Contact them or an admin.")


def take(db: Session, request_id: int, collector: User) -> None:
    req = load(db, request_id)
    if req.resident_id == collector.id:
        raise api_error(422, "own_pickup", "You cannot collect your own pickup.")
    taken = db.execute(
        update(HomePickup)
        .where(HomePickup.id == request_id, HomePickup.status == HomeStatus.requested)
        .values(status=HomeStatus.taken, collector_id=collector.id, taken_at=datetime.now(UTC))
    ).rowcount
    if not taken:
        raise api_error(409, "pickup_not_open", "Another collector has taken this pickup, or it was cancelled.")


def mine(db: Session, request_id: int, collector: User) -> HomePickup:
    req = load(db, request_id)
    if req.collector_id != collector.id:
        raise api_error(404, "pickup_not_found", "Pickup not found.")
    if req.status != HomeStatus.taken:
        raise api_error(409, "pickup_finished", "This pickup is already finished.")
    return req


def release(db: Session, req: HomePickup) -> None:
    req.status, req.collector_id, req.taken_at = HomeStatus.requested, None, None


def finish(db: Session, req: HomePickup, status: HomeStatus) -> None:
    """Moves a taken pickup on, once: a second tap on a slow connection is refused rather than counted twice."""
    done = db.execute(
        update(HomePickup)
        .where(HomePickup.id == req.id, HomePickup.status == HomeStatus.taken)
        .values(status=status, finished_at=datetime.now(UTC))
    ).rowcount
    if not done:
        raise api_error(409, "pickup_finished", "This pickup is already finished.")


def collect(db: Session, req: HomePickup, collector: User, lines: list[tuple[str, int]]) -> Deposit:
    """Weighed at the door: a deposit with no drop-off point, credited to the resident like any other."""
    if not lines:
        raise api_error(422, "no_items", "Enter the weight of at least one bin.")
    keys = [k for k, _ in lines]
    if len(set(keys)) != len(keys):
        raise api_error(422, "duplicate_stream", "Each bin can appear once.")
    streams = {s.key: s for s in db.scalars(select(Stream).where(Stream.key.in_(keys)))}
    deposit = Deposit(point_id=None, resident_id=req.resident_id, operator_id=collector.id, points=0)
    for key, grams in lines:
        if key not in streams:
            raise api_error(422, "unknown_stream", f"Unknown bin: {key}.")
        if not 0 < grams <= MAX_KG * 1000:
            raise api_error(422, "bad_weight", f"Each weight must be more than 0 and at most {MAX_KG:g} kg.")
        pts = points_for(grams, streams[key].points_per_kg)
        deposit.lines.append(DepositLine(stream_key=key, weight_g=grams, points=pts))
        deposit.points += pts
    finish(db, req, HomeStatus.done)
    db.add(deposit)
    db.flush()
    db.add(LedgerEntry(user_id=req.resident_id, delta=deposit.points, reason=LedgerReason.deposit,
                       deposit_id=deposit.id))  # fmt: skip
    req.deposit_id, req.deposit = deposit.id, deposit
    return deposit


def missed(db: Session, req: HomePickup, reason: str) -> None:
    finish(db, req, HomeStatus.missed)
    req.missed_reason = reason.strip()
