"""Admins: the pickup board, recording pickups, bin rates and prices, rewards and staff."""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..board import build_board
from ..db import get_db
from ..errors import api_error
from ..models import Container, Deposit, DepositLine, DropPoint, Pickup, Reward, Role, Stream, User
from ..points import container_fill_g
from ..schemas import DropPointAdmin, DropPointIn, PickupIn, RewardIn, RewardOut, RoleIn, StaffOut, StreamIn, StreamOut
from ..security import require_role

router = APIRouter(prefix="/admin", tags=["admin"])
admin = require_role(Role.admin)


@router.get("/board")
def board(request: Request, user: User = Depends(admin), db: Session = Depends(get_db)):
    """Every bin's fill and forecast, today's pickup run, and this month's totals (all computed from deposits)."""
    return build_board(db, ZoneInfo(request.app.state.settings.timezone), datetime.now(UTC))


@router.post("/pickups")
def record_pickups(body: PickupIn, user: User = Depends(admin), db: Session = Depends(get_db)):
    """The truck emptied these bins: record what it took and start each bin from zero."""
    containers = db.scalars(select(Container).where(Container.id.in_(body.container_ids))).all()
    if len(containers) != len(set(body.container_ids)):
        raise api_error(404, "container_not_found", "One of these bins does not exist.")
    now = datetime.now(UTC)
    taken = 0
    for c in containers:
        grams = container_fill_g(db, c)
        db.add(Pickup(container_id=c.id, collected_g=grams, by_user_id=user.id, created_at=now))
        c.emptied_at = now
        taken += grams
    db.commit()
    return {"emptied": len(containers), "collected_kg": round(taken / 1000, 1)}


@router.put("/streams/{key}", response_model=StreamOut)
def update_stream(key: str, body: StreamIn, user: User = Depends(admin), db: Session = Depends(get_db)):
    stream = db.get(Stream, key)
    if stream is None:
        raise api_error(404, "stream_not_found", "Unknown bin.")
    stream.points_per_kg, stream.price_sen_per_kg = body.points_per_kg, body.price_sen_per_kg
    db.commit()
    return stream


@router.get("/rewards", response_model=list[RewardOut])
def all_rewards(user: User = Depends(admin), db: Session = Depends(get_db)):
    return db.scalars(select(Reward).order_by(Reward.active.desc(), Reward.cost_points)).all()


@router.post("/rewards", response_model=RewardOut, status_code=201)
def create_reward(body: RewardIn, user: User = Depends(admin), db: Session = Depends(get_db)):
    reward = Reward(**body.model_dump())
    db.add(reward)
    db.commit()
    return reward


@router.put("/rewards/{reward_id}", response_model=RewardOut)
def update_reward(reward_id: int, body: RewardIn, user: User = Depends(admin), db: Session = Depends(get_db)):
    reward = db.get(Reward, reward_id)
    if reward is None:
        raise api_error(404, "reward_not_found", "Reward not found.")
    for k, v in body.model_dump().items():
        setattr(reward, k, v)
    db.commit()
    return reward


@router.get("/staff", response_model=list[StaffOut])
def staff(
    q: str = Query(default="", max_length=100, description="Find by e-mail or name; empty lists operators and admins"),
    user: User = Depends(admin),
    db: Session = Depends(get_db),
):
    query = select(User)
    if q.strip():
        like = f"%{q.strip().lower()}%"
        query = query.where(or_(User.email.like(like), User.display_name.ilike(like)))
    else:
        query = query.where(User.role != Role.resident)
    return db.scalars(query.order_by(User.display_name).limit(20)).all()


@router.put("/users/{user_id}/role", response_model=StaffOut)
def set_role(user_id: int, body: RoleIn, user: User = Depends(admin), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if target is None:
        raise api_error(404, "user_not_found", "User not found.")
    if target.id == user.id and body.role != Role.admin:
        raise api_error(409, "own_role", "You cannot remove your own admin role.")
    if body.drop_point_id is not None and db.get(DropPoint, body.drop_point_id) is None:
        raise api_error(404, "point_not_found", "Drop-off point not found.")
    if body.role == Role.operator and body.drop_point_id is None:
        raise api_error(422, "point_required", "Pick the drop-off point this operator works at.")
    target.role = body.role
    target.drop_point_id = body.drop_point_id if body.role != Role.resident else None
    db.commit()
    return target


def point_admin(p: DropPoint) -> dict:
    return {
        **{k: getattr(p, k) for k in ("id", "name", "address", "lat", "lng", "active", "is_demo")},
        "bins": [
            {"container_id": c.id, "stream_key": c.stream_key, "capacity_kg": c.capacity_kg} for c in p.containers
        ],
    }


def apply_point(db: Session, point: DropPoint, body: DropPointIn) -> None:
    keys = [b.stream_key for b in body.bins]
    if len(set(keys)) != len(keys):
        raise api_error(422, "duplicate_stream", "Each bin can appear once per drop-off point.")
    known = set(db.scalars(select(Stream.key)))
    if unknown := [k for k in keys if k not in known]:
        raise api_error(422, "unknown_stream", f"Unknown bin: {unknown[0]}.")
    point.name, point.address, point.lat, point.lng, point.active = (
        body.name.strip(), body.address.strip(), body.lat, body.lng, body.active
    )  # fmt: skip
    wanted = {b.stream_key: b.capacity_kg for b in body.bins}
    for c in list(point.containers):
        if c.stream_key in wanted:
            c.capacity_kg = wanted.pop(c.stream_key)
            continue
        used = db.scalar(
            select(func.count(DepositLine.id))
            .join(Deposit, Deposit.id == DepositLine.deposit_id)
            .where(Deposit.point_id == point.id, DepositLine.stream_key == c.stream_key)
        ) or db.scalar(select(func.count(Pickup.id)).where(Pickup.container_id == c.id))
        if used:
            raise api_error(
                409,
                "bin_has_history",
                "A bin with recorded deposits cannot be removed. Close the drop-off point instead.",
            )
        point.containers.remove(c)
        db.delete(c)
    for key, cap in wanted.items():
        point.containers.append(Container(stream_key=key, capacity_kg=cap))


@router.get("/points", response_model=list[DropPointAdmin])
def all_points(user: User = Depends(admin), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(DropPoint).options(selectinload(DropPoint.containers)).order_by(DropPoint.active.desc(), DropPoint.name)
    ).all()
    return [point_admin(p) for p in rows]


@router.post("/points", response_model=DropPointAdmin, status_code=201)
def create_point(body: DropPointIn, user: User = Depends(admin), db: Session = Depends(get_db)):
    point = DropPoint(name="", address="", lat=0, lng=0)
    db.add(point)
    apply_point(db, point, body)
    db.commit()
    db.refresh(point, ["containers"])
    return point_admin(point)


@router.put("/points/{point_id}", response_model=DropPointAdmin)
def update_point(point_id: int, body: DropPointIn, user: User = Depends(admin), db: Session = Depends(get_db)):
    point = db.scalar(select(DropPoint).where(DropPoint.id == point_id).options(selectinload(DropPoint.containers)))
    if point is None:
        raise api_error(404, "point_not_found", "Drop-off point not found.")
    apply_point(db, point, body)
    db.commit()
    db.refresh(point, ["containers"])
    return point_admin(point)
