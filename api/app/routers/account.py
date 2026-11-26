"""Residents: member card, points history, rewards. Public: the bins and the drop-off points."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..models import Deposit, DropPoint, LedgerEntry, Redemption, Reward, Stream, User
from ..points import balance, redeem
from ..schemas import CardOut, DropPointOut, LedgerItem, LineOut, PointsPage, RedemptionOut, RewardOut, StreamOut
from ..security import current_user

router = APIRouter(tags=["points"])


def redemption_out(r: Redemption) -> dict:
    return {
        "id": r.id,
        "reward_name": r.reward.name,
        "cost_points": r.cost_points,
        "code": r.code,
        "created_at": r.created_at,
        "used_at": r.used_at,
    }


@router.get("/streams", response_model=list[StreamOut])
def streams(db: Session = Depends(get_db)):
    return db.scalars(select(Stream).order_by(Stream.sort)).all()


@router.get("/points", response_model=list[DropPointOut])
def drop_points(db: Session = Depends(get_db)):
    """Where residents can hand in recycling, and which bins each place holds."""
    rows = db.scalars(
        select(DropPoint).where(DropPoint.active).options(selectinload(DropPoint.containers)).order_by(DropPoint.name)
    ).all()
    return [
        {**{k: getattr(p, k) for k in ("id", "name", "address", "lat", "lng", "is_demo")},
         "streams": [c.stream_key for c in p.containers]}
        for p in rows
    ]  # fmt: skip


@router.get("/me/card", response_model=CardOut)
def my_card(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {"display_name": user.display_name, "member_code": user.member_code, "balance": balance(db, user.id)}


@router.get("/me/points", response_model=PointsPage)
def my_points(
    before: Annotated[int | None, Query(description="Only entries older than this id")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """The balance and every change to it, newest first: deposits (with what was weighed) and rewards."""
    q = select(LedgerEntry).where(LedgerEntry.user_id == user.id)
    if before is not None:
        q = q.where(LedgerEntry.id < before)
    rows = db.scalars(q.order_by(LedgerEntry.id.desc()).limit(limit + 1)).all()
    page = rows[:limit]
    dep_ids = [e.deposit_id for e in page if e.deposit_id]
    red_ids = [e.redemption_id for e in page if e.redemption_id]
    deps = {
        d.id: d
        for d in db.scalars(
            select(Deposit)
            .where(Deposit.id.in_(dep_ids))
            .options(selectinload(Deposit.lines), selectinload(Deposit.point))
        )
    }
    reds = {
        r.id: r
        for r in db.scalars(
            select(Redemption).where(Redemption.id.in_(red_ids)).options(selectinload(Redemption.reward))
        )
    }
    items = []
    for e in page:
        item = LedgerItem(id=e.id, delta=e.delta, reason=e.reason.value, created_at=e.created_at)
        if e.deposit_id in deps:
            d = deps[e.deposit_id]
            item.point_name = d.point.name if d.point else "Home pickup"
            item.lines = [LineOut(stream_key=ln.stream_key, weight_g=ln.weight_g, points=ln.points) for ln in d.lines]
        if e.redemption_id in reds:
            item.reward_name = reds[e.redemption_id].reward.name
        items.append(item)
    return {"balance": balance(db, user.id), "items": items, "next_before": page[-1].id if len(rows) > limit else None}


@router.get("/rewards", response_model=list[RewardOut])
def rewards(db: Session = Depends(get_db)):
    return db.scalars(select(Reward).where(Reward.active).order_by(Reward.cost_points)).all()


@router.post("/rewards/{reward_id}/redeem", response_model=RedemptionOut, status_code=201)
def redeem_reward(reward_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    red = redeem(db, user=user, reward_id=reward_id)
    db.refresh(red, ["reward"])
    return redemption_out(red)


@router.get("/me/redemptions", response_model=list[RedemptionOut])
def my_redemptions(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Redemption)
        .where(Redemption.user_id == user.id)
        .options(selectinload(Redemption.reward))
        .order_by(Redemption.created_at.desc())
    ).all()
    return [redemption_out(r) for r in rows]
