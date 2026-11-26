"""Collectors (Phase 4): see open jobs, take one, empty each bin and record the truck's weight with a photo."""

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import jobs
from ..db import get_db
from ..errors import api_error
from ..models import Job, JobStatus, Pickup, Role, User
from ..schemas import SkipIn
from ..security import current_user, require_role
from .scans import read_upload

router = APIRouter(tags=["collector"])
collector = require_role(Role.collector)


def job_list(db: Session, *conditions) -> list[dict]:
    ids = db.scalars(select(Job.id).where(*conditions).order_by(Job.created_at, Job.id)).all()
    return [jobs.job_out(jobs.load_job(db, i)) for i in ids]


@router.get("/collector/jobs")
def my_jobs(user: User = Depends(collector), db: Session = Depends(get_db)):
    """Jobs anyone can take, the ones this collector has, and what they finished in the last week."""
    week_ago = datetime.now(UTC) - timedelta(days=7)
    return {
        "open": job_list(db, Job.status == JobStatus.open),
        "mine": job_list(db, Job.status == JobStatus.taken, Job.collector_id == user.id),
        "done": job_list(db, Job.status == JobStatus.done, Job.collector_id == user.id, Job.finished_at >= week_ago),
    }


@router.post("/collector/jobs/{job_id}/take")
def take(job_id: int, user: User = Depends(collector), db: Session = Depends(get_db)):
    jobs.take_job(db, job_id, user)
    db.commit()
    return jobs.job_out(jobs.load_job(db, job_id))


@router.post("/collector/jobs/{job_id}/release")
def release(job_id: int, user: User = Depends(collector), db: Session = Depends(get_db)):
    """Hand a job back before starting it, so another collector can take it."""
    jobs.release_job(db, job_id, user)
    db.commit()
    return jobs.job_out(jobs.load_job(db, job_id))


@router.post("/collector/jobs/{job_id}/items/{item_id}/collect")
def collect(
    request: Request,
    job_id: int,
    item_id: int,
    weight_kg: Annotated[float, Form(description="What the truck's scale showed for this bin, in kg")],
    photo: Annotated[UploadFile, File(description="Photo of the emptied bin")],
    user: User = Depends(collector),
    db: Session = Depends(get_db),
):
    data = read_upload(request, photo)
    job = jobs.my_job(db, job_id, user)
    jobs.collect(db, job, item_id, weight_kg, data, request.app.state.settings.media_dir, user)
    db.commit()
    return jobs.job_out(jobs.load_job(db, job_id))


@router.post("/collector/jobs/{job_id}/items/{item_id}/skip")
def skip(job_id: int, item_id: int, body: SkipIn, user: User = Depends(collector), db: Session = Depends(get_db)):
    job = jobs.my_job(db, job_id, user)
    jobs.skip(db, job, item_id, body.reason)
    db.commit()
    return jobs.job_out(jobs.load_job(db, job_id))


@router.get("/pickups/{pickup_id}/photo", response_class=FileResponse)
def pickup_photo(request: Request, pickup_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The collector's photo of the emptied bin: for admins, and for the collector who took it."""
    pickup = db.scalars(
        select(Pickup).where(
            Pickup.id == pickup_id,
            Pickup.photo_path.is_not(None),
            or_(Pickup.by_user_id == user.id, user.role == Role.admin),
        )
    ).first()
    path = request.app.state.settings.media_dir / pickup.photo_path if pickup else None
    if path is None or not path.is_file():
        raise api_error(404, "photo_not_found", "Photo not found.")
    media = jobs.MEDIA_TYPES.get(path.suffix, "application/octet-stream")
    return FileResponse(path, media_type=media, headers={"Cache-Control": "private, max-age=3600"})
