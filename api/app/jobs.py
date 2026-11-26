"""Pickup jobs (Phase 4): the admin offers bins that need emptying, a collector takes the job, empties each bin and
records what the truck's scale said, with a photo. Like a ride on Grab, one job goes to one collector."""

import uuid
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from .errors import api_error
from .models import Container, Job, JobItem, JobStatus, Pickup, User
from .points import container_fill_g

ACTIVE = (JobStatus.open, JobStatus.taken)
MAX_PICKUP_KG = 5_000  # a sanity limit for one bin's load, not a truck's capacity

# The first bytes of the photo formats a phone produces; anything else is refused
PHOTO_KINDS = {
    b"\xff\xd8\xff": (".jpg", "image/jpeg"),
    b"\x89PNG\r\n\x1a\n": (".png", "image/png"),
}


def photo_kind(data: bytes) -> tuple[str, str] | None:
    """(extension, media type) of a JPEG, PNG, WebP or HEIC photo, from its content rather than its name."""
    for magic, kind in PHOTO_KINDS.items():
        if data.startswith(magic):
            return kind
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp", "image/webp"
    if data[4:8] == b"ftyp" and data[8:12] in (b"heic", b"heix", b"mif1", b"msf1", b"heim", b"heis"):
        return ".heic", "image/heic"
    return None


MEDIA_TYPES = {ext: media for ext, media in [*PHOTO_KINDS.values(), (".webp", "image/webp"), (".heic", "image/heic")]}


def load_job(db: Session, job_id: int) -> Job:
    job = db.scalars(
        select(Job)
        .where(Job.id == job_id)
        .options(
            selectinload(Job.point),
            selectinload(Job.collector),
            selectinload(Job.items).selectinload(JobItem.container).selectinload(Container.stream),
            selectinload(Job.items).selectinload(JobItem.pickup),
        )
    ).first()
    if job is None:
        raise api_error(404, "job_not_found", "Job not found.")
    return job


def job_out(job: Job) -> dict:
    p = job.point
    items = []
    for it in job.items:
        pk = it.pickup
        items.append(
            {
                "id": it.id,
                "container_id": it.container_id,
                "stream_key": it.container.stream_key,
                "stream_name": it.container.stream.name,
                "capacity_kg": it.container.capacity_kg,
                "expected_kg": round(it.expected_kg, 1),
                "state": "collected" if it.pickup_id else "skipped" if it.skipped_reason else "to_do",
                "collected_kg": round(pk.collected_g / 1000, 1) if pk else None,
                "weighed_in_kg": round(pk.expected_g / 1000, 1) if pk and pk.expected_g is not None else None,
                "pickup_id": pk.id if pk else None,
                "has_photo": bool(pk and pk.photo_path),
                "skipped_reason": it.skipped_reason,
                "finished_at": it.finished_at,
            }
        )
    return {
        "id": job.id,
        "status": job.status,
        "point": {"id": p.id, "name": p.name, "address": p.address, "lat": p.lat, "lng": p.lng, "is_demo": p.is_demo},
        "created_at": job.created_at,
        "taken_at": job.taken_at,
        "finished_at": job.finished_at,
        "collector": {"id": job.collector.id, "name": job.collector.display_name} if job.collector else None,
        "items": items,
    }


def offer_jobs(db: Session, point_ids: list[int], board_points: dict[int, dict], admin: User) -> list[Job]:
    """One job per point, for its bins that are due or soon (or, if none are, every bin with something in it).
    A point that already has an open or taken job is refused, so two collectors never drive to the same bins."""
    busy = set(db.scalars(select(Job.point_id).where(Job.point_id.in_(point_ids), Job.status.in_(ACTIVE))))
    if busy:
        names = ", ".join(sorted(board_points[i]["name"] for i in busy if i in board_points)) or "one of these points"
        raise api_error(409, "job_exists", f"There is already an open job for {names}.")
    now = datetime.now(UTC)
    jobs = []
    for pid in dict.fromkeys(point_ids):  # keeps the order the admin chose, without repeats
        point = board_points.get(pid)
        if point is None:
            raise api_error(404, "point_not_found", "Drop-off point not found, or it is closed.")
        bins = [b for b in point["bins"] if b["status"] in ("due", "soon")] or [
            b for b in point["bins"] if b["fill_kg"] > 0
        ]
        if not bins:
            raise api_error(422, "nothing_to_collect", f"Nothing has been weighed in at {point['name']} yet.")
        job = Job(point_id=pid, created_by_id=admin.id, created_at=now)
        job.items = [JobItem(container_id=b["container_id"], expected_kg=b["fill_kg"]) for b in bins]
        db.add(job)
        jobs.append(job)
    db.flush()
    return jobs


def take_job(db: Session, job_id: int, collector: User) -> None:
    """Only one collector can take a job: the update succeeds for whoever is first."""
    taken = db.execute(
        update(Job)
        .where(Job.id == job_id, Job.status == JobStatus.open)
        .values(status=JobStatus.taken, collector_id=collector.id, taken_at=datetime.now(UTC))
    ).rowcount
    if not taken:
        if db.get(Job, job_id) is None:
            raise api_error(404, "job_not_found", "Job not found.")
        raise api_error(409, "job_not_open", "Another collector has taken this job, or it was withdrawn.")


def my_job(db: Session, job_id: int, collector: User) -> Job:
    job = load_job(db, job_id)
    if job.collector_id != collector.id:
        raise api_error(404, "job_not_found", "Job not found.")  # someone else's job is none of their business
    if job.status != JobStatus.taken:
        raise api_error(409, "job_not_taken", "This job is finished or was withdrawn.")
    return job


def release_job(db: Session, job_id: int, collector: User) -> None:
    job = my_job(db, job_id, collector)
    if any(it.finished_at for it in job.items):
        raise api_error(409, "job_started", "You have already collected or skipped a bin here. Finish the rest.")
    job.status, job.collector_id, job.taken_at = JobStatus.open, None, None


def finish_item(db: Session, job: Job, item_id: int) -> JobItem:
    """Marks the bin finished, once: a second tap on a slow connection is refused rather than counted twice."""
    item = next((it for it in job.items if it.id == item_id), None)
    if item is None:
        raise api_error(404, "item_not_found", "That bin is not part of this job.")
    now = datetime.now(UTC)
    done = db.execute(
        update(JobItem).where(JobItem.id == item.id, JobItem.finished_at.is_(None)).values(finished_at=now)
    ).rowcount
    if not done:
        raise api_error(409, "item_finished", "This bin is already done.")
    item.finished_at = now
    return item


def close_if_finished(job: Job) -> None:
    if all(it.finished_at for it in job.items):
        job.status, job.finished_at = JobStatus.done, datetime.now(UTC)


def collect(
    db: Session, job: Job, item_id: int, weight_kg: float, photo: bytes, media_dir: Path, collector: User
) -> Pickup:
    """The bin is empty: record the scale's weight next to what was weighed in, keep the photo, start from zero."""
    if not 0 < weight_kg <= MAX_PICKUP_KG:
        raise api_error(422, "bad_weight", f"Enter the weight in kg, between 0 and {MAX_PICKUP_KG}.")
    kind = photo_kind(photo)
    if kind is None:
        raise api_error(422, "not_a_photo", "Add a photo of the emptied bin (JPEG, PNG, WebP or HEIC).")
    item = finish_item(db, job, item_id)
    container = item.container
    now = item.finished_at
    name = f"pickup-{uuid.uuid4()}{kind[0]}"
    media_dir.mkdir(parents=True, exist_ok=True)
    (media_dir / name).write_bytes(photo)
    pickup = Pickup(
        container_id=container.id,
        collected_g=round(weight_kg * 1000),
        expected_g=container_fill_g(db, container),
        measured=True,
        photo_path=name,
        by_user_id=collector.id,
        created_at=now,
    )
    db.add(pickup)
    db.flush()
    item.pickup_id, item.pickup = pickup.id, pickup
    container.emptied_at = now
    close_if_finished(job)
    return pickup


def skip(db: Session, job: Job, item_id: int, reason: str) -> None:
    """The bin could not be emptied (locked, missing, blocked): the job moves on, the bin keeps its fill."""
    item = finish_item(db, job, item_id)
    item.skipped_reason = reason.strip()
    close_if_finished(job)


def active_job_by_point(db: Session) -> dict[int, Job]:
    return {
        j.point_id: j
        for j in db.scalars(select(Job).where(Job.status.in_(ACTIVE)).options(selectinload(Job.collector)))
    }
