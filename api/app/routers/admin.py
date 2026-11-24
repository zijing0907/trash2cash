"""Admins: the pickup board, recording pickups, bin rates and prices, rewards and staff."""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..board import build_board
from ..db import get_db
from ..errors import api_error
from ..models import Container, DropPoint, Pickup, Reward, Role, Stream, User
from ..points import container_fill_g
from ..schemas import PickupIn, RewardIn, RewardOut, RoleIn, StaffOut, StreamIn, StreamOut
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
