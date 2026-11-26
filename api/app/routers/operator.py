"""Operators at a drop-off point: find the resident, weigh what they brought, credit the points."""

from datetime import UTC, datetime, time
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..errors import api_error
from ..models import Container, Deposit, DropPoint, Redemption, Role, User
from ..points import balance, normalise_code, record_deposit
from ..schemas import DepositIn, DepositOut, LineOut, ResidentOut, VoucherOut
from ..security import require_role

router = APIRouter(prefix="/operator", tags=["operator"])
staff = require_role(Role.operator, Role.admin)


def find_resident(db: Session, code: str) -> User:
    user = db.scalar(select(User).where(User.member_code == normalise_code(code)))
    if user is None:
        raise api_error(404, "member_not_found", "No member has this code. Check it and try again.")
    return user


def deposit_out(d: Deposit, resident: User, balance_after: int | None = None) -> dict:
    return {
        "id": d.id,
        "created_at": d.created_at,
        "points": d.points,
        "resident_name": resident.display_name,
        "member_code": resident.member_code,
        "point_name": d.point.name if d.point else "Home pickup",
        "lines": [LineOut(stream_key=ln.stream_key, weight_g=ln.weight_g, points=ln.points) for ln in d.lines],
        "balance_after": balance_after,
    }


def operator_point(db: Session, user: User, point_id: int | None) -> DropPoint:
    pid = point_id if (user.role == Role.admin and point_id) else user.drop_point_id
    if pid is None:
        raise api_error(409, "no_point", "You are not assigned to a drop-off point yet. Ask an admin to assign you.")
    point = db.scalar(
        select(DropPoint)
        .where(DropPoint.id == pid)
        .options(selectinload(DropPoint.containers).selectinload(Container.stream))
    )
    if point is None or not point.active:
        raise api_error(404, "point_not_found", "This drop-off point does not exist or is closed.")
    return point


@router.get("/residents/{code}", response_model=ResidentOut)
def resident(code: str, user: User = Depends(staff), db: Session = Depends(get_db)):
    """What the operator needs to confirm who is at the counter: their name and balance, nothing else."""
    r = find_resident(db, code)
    return {"display_name": r.display_name, "member_code": r.member_code, "balance": balance(db, r.id)}


@router.post("/deposits", response_model=DepositOut, status_code=201)
def create_deposit(body: DepositIn, user: User = Depends(staff), db: Session = Depends(get_db)):
    point = operator_point(db, user, body.point_id)
    resident = find_resident(db, body.member_code)
    lines = [(ln.stream_key, round(ln.weight_kg * 1000)) for ln in body.lines]
    d = record_deposit(db, point=point, resident=resident, operator=user, lines=lines)
    db.refresh(d, ["lines", "point"])
    return deposit_out(d, resident, balance(db, resident.id))


@router.get("/deposits", response_model=list[DepositOut])
def todays_deposits(
    request: Request,
    point_id: int | None = Query(default=None, description="Admins only; operators see their own point"),
    user: User = Depends(staff),
    db: Session = Depends(get_db),
):
    """Today's deposits at the operator's point, newest first."""
    point = operator_point(db, user, point_id)
    tz = ZoneInfo(request.app.state.settings.timezone)
    # Local midnight, compared in UTC: stored times are UTC (SQLite keeps them without a zone)
    start = datetime.combine(datetime.now(tz).date(), time.min, tzinfo=tz).astimezone(UTC)
    rows = db.scalars(
        select(Deposit)
        .where(Deposit.point_id == point.id, Deposit.created_at >= start)
        .options(selectinload(Deposit.lines), selectinload(Deposit.point), selectinload(Deposit.resident))
        .order_by(Deposit.created_at.desc())
        .limit(100)
    ).all()
    return [deposit_out(d, d.resident) for d in rows]


def find_voucher(db: Session, code: str) -> Redemption:
    v = db.scalar(
        select(Redemption)
        .where(Redemption.code == normalise_code(code))
        .options(selectinload(Redemption.reward), selectinload(Redemption.user))
    )
    if v is None:
        raise api_error(404, "voucher_not_found", "No voucher has this code. Check it and try again.")
    return v


def voucher_out(v: Redemption) -> dict:
    return {
        "id": v.id,
        "reward_name": v.reward.name,
        "cost_points": v.cost_points,
        "code": v.code,
        "created_at": v.created_at,
        "used_at": v.used_at,
        "member_name": v.user.display_name,
        "member_code": v.user.member_code,
    }


@router.get("/vouchers/{code}", response_model=VoucherOut)
def voucher(code: str, user: User = Depends(staff), db: Session = Depends(get_db)):
    """What a voucher is for, whose it is, and whether it was already collected."""
    return voucher_out(find_voucher(db, code))


@router.post("/vouchers/{code}/collect", response_model=VoucherOut)
def collect_voucher(code: str, user: User = Depends(staff), db: Session = Depends(get_db)):
    """Hand the reward over. One conditional update, so a code shown twice can only be collected once."""
    v = find_voucher(db, code)
    done = db.execute(
        update(Redemption)
        .where(Redemption.id == v.id, Redemption.used_at.is_(None))
        .values(used_at=datetime.now(UTC), used_by_id=user.id)
    ).rowcount
    db.commit()
    db.refresh(v)
    if not done:
        raise api_error(409, "already_collected", "This voucher was already collected.")
    return voucher_out(v)
