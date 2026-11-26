"""Member codes, points, deposits and redemptions. Every change to a balance is a ledger entry."""

import secrets
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .errors import api_error
from .models import (
    Container,
    Deposit,
    DepositLine,
    DropPoint,
    LedgerEntry,
    LedgerReason,
    Redemption,
    Reward,
    Stream,
    User,
)

# No 0/O, 1/I/L: codes are read aloud and typed at a counter
ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
MAX_LINE_G = 100_000  # 100 kg of one stream in one deposit is a typo, not a deposit


def new_code(n: int = 8) -> str:
    raw = "".join(secrets.choice(ALPHABET) for _ in range(n))
    return f"{raw[:4]}-{raw[4:]}"


def new_member_code(db: Session) -> str:
    while True:
        code = new_code()
        if not db.scalar(select(User.id).where(User.member_code == code)):
            return code


def normalise_code(code: str) -> str:
    raw = "".join(ch for ch in code.upper() if ch.isalnum())
    return f"{raw[:4]}-{raw[4:]}" if len(raw) == 8 else code.upper().strip()


def balance(db: Session, user_id: int) -> int:
    return int(db.scalar(select(func.coalesce(func.sum(LedgerEntry.delta), 0)).where(LedgerEntry.user_id == user_id)))


def points_for(weight_g: int, points_per_kg: int) -> int:
    return round(weight_g * points_per_kg / 1000)


def record_deposit(
    db: Session, *, point: DropPoint, resident: User, operator: User, lines: list[tuple[str, int]]
) -> Deposit:
    """lines: (stream key, weight in grams). Validates, prices each line and credits the resident in one commit."""
    if resident.id == operator.id:
        raise api_error(422, "own_deposit", "Staff cannot record deposits for themselves.")
    if not lines:
        raise api_error(422, "no_items", "Enter the weight of at least one bin.")
    keys = [k for k, _ in lines]
    if len(set(keys)) != len(keys):
        raise api_error(422, "duplicate_stream", "Each bin can appear once per deposit.")
    collected = {c.stream_key for c in point.containers}
    streams = {s.key: s for s in db.scalars(select(Stream).where(Stream.key.in_(keys)))}
    deposit = Deposit(point_id=point.id, resident_id=resident.id, operator_id=operator.id, points=0)
    for key, grams in lines:
        if key not in streams:
            raise api_error(422, "unknown_stream", f"Unknown bin: {key}.")
        if key not in collected:
            raise api_error(422, "not_collected", f"{point.name} does not collect {streams[key].name.lower()}.")
        if not 0 < grams <= MAX_LINE_G:
            raise api_error(422, "bad_weight", "Each weight must be more than 0 and at most 100 kg.")
        pts = points_for(grams, streams[key].points_per_kg)
        deposit.lines.append(DepositLine(stream_key=key, weight_g=grams, points=pts))
        deposit.points += pts
    db.add(deposit)
    db.flush()
    db.add(LedgerEntry(user_id=resident.id, delta=deposit.points, reason=LedgerReason.deposit, deposit_id=deposit.id))
    db.commit()
    return deposit


def redeem(db: Session, *, user: User, reward_id: int) -> Redemption:
    """Spends points on a reward. The user's row is locked first (PostgreSQL), so two redemptions sent at the
    same moment cannot both spend the same points; limited stock is taken with a conditional update."""
    db.execute(select(User.id).where(User.id == user.id).with_for_update())
    reward = db.get(Reward, reward_id)
    if reward is None or not reward.active:
        raise api_error(404, "reward_not_found", "This reward is not available.")
    if balance(db, user.id) < reward.cost_points:
        raise api_error(409, "not_enough_points", "You do not have enough points for this reward yet.")
    if reward.stock is not None:
        taken = db.execute(
            update(Reward).where(Reward.id == reward.id, Reward.stock > 0).values(stock=Reward.stock - 1)
        ).rowcount
        if not taken:
            raise api_error(409, "out_of_stock", "This reward has run out.")
    red = Redemption(user_id=user.id, reward_id=reward.id, cost_points=reward.cost_points, code=new_code())
    db.add(red)
    db.flush()
    db.add(
        LedgerEntry(user_id=user.id, delta=-reward.cost_points, reason=LedgerReason.redemption, redemption_id=red.id)
    )
    db.commit()
    return red


def container_fill_g(db: Session, container: Container) -> int:
    """Grams deposited into this bin since it was last emptied."""
    q = (
        select(func.coalesce(func.sum(DepositLine.weight_g), 0))
        .join(Deposit, Deposit.id == DepositLine.deposit_id)
        .where(Deposit.point_id == container.point_id, DepositLine.stream_key == container.stream_key)
    )
    if container.emptied_at is not None:
        q = q.where(Deposit.created_at > container.emptied_at)
    return int(db.scalar(q))


def now() -> datetime:
    return datetime.now(UTC)
