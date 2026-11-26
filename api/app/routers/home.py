"""Home pickups (Phase 6b): residents book them, collectors take and weigh them, admins see them all."""

from datetime import UTC, date, datetime, timedelta
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import home
from ..db import get_db
from ..errors import api_error
from ..jobs import MEDIA_TYPES
from ..models import HomePickup, HomeStatus, Role, Slot, User
from ..schemas import HomeLineIn, SkipIn
from ..security import current_user, require_role
from .scans import read_upload

router = APIRouter(tags=["home pickups"])
collector = require_role(Role.collector)


def listed(db: Session, *conditions, full: bool, order=HomePickup.day) -> list[dict]:
    ids = db.scalars(select(HomePickup.id).where(*conditions).order_by(order, HomePickup.id)).all()
    return [home.out(home.load(db, i), full=full) for i in ids]


@router.post("/home-pickups", status_code=201)
def book(
    request: Request,
    streams: Annotated[str, Form(description="Bins the items belong in, comma separated, e.g. 'blue bin,orange bin'")],
    rough_kg: Annotated[float, Form(description="About how much, in kg")],
    address: Annotated[str, Form(min_length=3, max_length=200)],
    lat: Annotated[float, Form()],
    lng: Annotated[float, Form()],
    day: Annotated[date, Form()],
    slot: Annotated[Slot, Form()],
    photo: Annotated[UploadFile, File(description="A photo of the items")],
    note: Annotated[str, Form(max_length=200)] = "",
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Book a collector to come home for 5 to 500 kg of recyclables. Points come when it is weighed at the door."""
    today = datetime.now(UTC).astimezone(ZoneInfo(request.app.state.settings.timezone)).date()
    req = home.request_pickup(
        db, user, streams=streams.split(","), rough_kg=rough_kg, address=address, lat=lat, lng=lng, note=note,
        day=day, slot=slot, photo=read_upload(request, photo), media_dir=request.app.state.settings.media_dir,
        today=today,
    )  # fmt: skip
    db.commit()
    return home.out(home.load(db, req.id), full=True)


@router.get("/home-pickups/mine")
def my_pickups(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return listed(db, HomePickup.resident_id == user.id, full=True, order=HomePickup.created_at.desc())


@router.post("/home-pickups/{request_id}/cancel")
def cancel(request_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    home.cancel(db, home.load(db, request_id), user)
    db.commit()
    return home.out(home.load(db, request_id), full=True)


@router.get("/home-pickups/{request_id}/photo", response_class=FileResponse)
def photo(request: Request, request_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The resident's photo of the items: for the resident, admins, and the collector who took the pickup."""
    req = db.get(HomePickup, request_id)
    allowed = req is not None and (user.role == Role.admin or user.id in (req.resident_id, req.collector_id))
    path = request.app.state.settings.media_dir / req.photo_path if allowed else None
    if path is None or not path.is_file():
        raise api_error(404, "photo_not_found", "Photo not found.")
    return FileResponse(path, media_type=MEDIA_TYPES.get(path.suffix, "application/octet-stream"),
                        headers={"Cache-Control": "private, max-age=3600"})  # fmt: skip


# ---- collectors ------------------------------------------------------------------------------------


@router.get("/collector/home-pickups")
def collector_list(user: User = Depends(collector), db: Session = Depends(get_db)):
    """Requests anyone can take (area only), the ones this collector has (in full), and the last week's."""
    week_ago = datetime.now(UTC) - timedelta(days=7)
    return {
        "open": listed(db, HomePickup.status == HomeStatus.requested, HomePickup.resident_id != user.id, full=False),
        "mine": listed(db, HomePickup.status == HomeStatus.taken, HomePickup.collector_id == user.id, full=True),
        "done": listed(
            db,
            HomePickup.status.in_((HomeStatus.done, HomeStatus.missed)),
            HomePickup.collector_id == user.id,
            HomePickup.finished_at >= week_ago,
            full=True,
            order=HomePickup.finished_at.desc(),
        ),
    }


@router.post("/collector/home-pickups/{request_id}/take")
def take(request_id: int, user: User = Depends(collector), db: Session = Depends(get_db)):
    home.take(db, request_id, user)
    db.commit()
    return home.out(home.load(db, request_id), full=True)


@router.post("/collector/home-pickups/{request_id}/release")
def release(request_id: int, user: User = Depends(collector), db: Session = Depends(get_db)):
    home.release(db, home.mine(db, request_id, user))
    db.commit()
    return home.out(home.load(db, request_id), full=False)


@router.post("/collector/home-pickups/{request_id}/collect")
def collect(request_id: int, body: list[HomeLineIn], user: User = Depends(collector), db: Session = Depends(get_db)):
    """Weighed at the door, per bin. The resident gets points for these weights, not for their estimate."""
    req = home.mine(db, request_id, user)
    home.collect(db, req, user, [(ln.stream_key, round(ln.weight_kg * 1000)) for ln in body])
    db.commit()
    return home.out(home.load(db, request_id), full=True)


@router.post("/collector/home-pickups/{request_id}/missed")
def missed(request_id: int, body: SkipIn, user: User = Depends(collector), db: Session = Depends(get_db)):
    """Came, but could not collect (nobody home, not as described). The resident can book again."""
    home.missed(db, home.mine(db, request_id, user), body.reason)
    db.commit()
    return home.out(home.load(db, request_id), full=True)


# ---- admins ----------------------------------------------------------------------------------------


@router.get("/admin/home-pickups")
def admin_list(user: User = Depends(require_role(Role.admin)), db: Session = Depends(get_db)):
    since = datetime.now(UTC) - timedelta(days=14)
    return listed(
        db,
        or_(HomePickup.status.in_(home.OPEN), HomePickup.created_at >= since),
        full=True,
        order=HomePickup.created_at.desc(),
    )
