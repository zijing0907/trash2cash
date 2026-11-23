"""Scanning: the web app sends a photo, the API asks ml-service, stores the answer and returns it."""

import logging
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..errors import api_error
from ..ml_client import MLClient
from ..models import Scan, User
from ..ratelimit import limit_scans
from ..schemas import LabelIn, ScanOut, ScanPage, ScanResult, ScanSummary
from ..security import current_user, optional_user

log = logging.getLogger(__name__)
router = APIRouter(tags=["scans"])

UploadedPhoto = Annotated[UploadFile, File(description="Photo of one item: JPEG, PNG, WebP or HEIC")]
# Donated photos keep their own format; the extension is chosen from what the browser said
EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic"}


def ml(request: Request) -> MLClient:
    return request.app.state.ml


def read_upload(request: Request, file: UploadFile) -> bytes:
    limit = request.app.state.settings.max_upload_bytes
    data = file.file.read(limit + 1)
    if len(data) > limit:
        raise api_error(413, "file_too_large", f"The file is larger than {limit / 2**20:g} MB.")
    if not data:
        raise api_error(422, "empty_file", "The uploaded file is empty.")
    return data


def scan_out(scan: Scan) -> dict:
    return {
        **{c: getattr(scan, c) for c in ScanOut.model_fields if hasattr(scan, c)},
        "photo_donated": scan.photo_path is not None,
    }


def get_own_scan(scan_id: uuid.UUID, user: User | None, db: Session) -> Scan:
    """A scan the caller may change. Scans of a logged-in user belong to that user only. A guest's scan
    can be changed by whoever holds its id: a random UUID that only the scanning browser was given."""
    scan = db.get(Scan, scan_id)
    if scan is None or (scan.user_id is not None and (user is None or user.id != scan.user_id)):
        raise api_error(404, "scan_not_found", "Scan not found.")
    return scan


@router.post("/scans", response_model=ScanResult, status_code=201, dependencies=[Depends(limit_scans)])
def create_scan(
    request: Request,
    file: UploadedPhoto,
    zoom: Annotated[bool, Form(description="Let the model search the photo for the item (slower)")] = False,
    donate: Annotated[bool, Form(description="Keep the photo to help retrain the model (user's consent)")] = False,
    user: User | None = Depends(optional_user),
    db: Session = Depends(get_db),
):
    data = read_upload(request, file)
    result = ml(request).predict(data, file.filename or "photo", file.content_type or "", zoom)

    top = result["top3"][0]["class"]
    scan = Scan(
        user_id=user.id if user else None,
        model_version=result["model_version"],
        predicted_class=top,
        predicted_bin=result.get("bin"),
        confidence=result["confidence"],
        unsure=result["unsure"],
        zoomed=result.get("zoomed", False),
        top3=result["top3"],
        dhash=result["dhash"],
        latency_ms=result["latency_ms"],
    )
    db.add(scan)
    db.flush()  # assigns scan.id
    if donate:
        media = request.app.state.settings.media_dir
        media.mkdir(parents=True, exist_ok=True)
        name = f"{scan.id}{EXTENSIONS.get(file.content_type or '', '.img')}"
        (media / name).write_bytes(data)
        scan.photo_path = name
    db.commit()
    return {
        **scan_out(scan),
        "class_index": result["class_index"],
        "threshold": result["threshold"],
        "crop_box": result["crop_box"],
    }


@router.post(
    "/explain",
    response_class=Response,
    dependencies=[Depends(limit_scans)],
    responses={200: {"content": {"image/png": {}}, "description": "Grad-CAM heat map over the model input"}},
)
def explain(
    request: Request,
    file: UploadedPhoto,
    class_index: Annotated[int | None, Form(ge=0)] = None,
    zoom: Annotated[bool, Form(description="Use the same value as for the scan")] = False,
):
    """Where the model looked. The browser sends the same photo again (the API does not keep photos
    unless they are donated); ml-service repeats the exact preprocessing of the scan."""
    data = read_upload(request, file)
    png, headers = ml(request).explain(data, file.filename or "photo", file.content_type or "", class_index, zoom)
    return Response(png, media_type="image/png", headers={**headers, "Cache-Control": "no-store"})


@router.put("/scans/{scan_id}/label", response_model=ScanOut)
def label_scan(
    scan_id: uuid.UUID,
    body: LabelIn,
    request: Request,
    user: User | None = Depends(optional_user),
    db: Session = Depends(get_db),
):
    """The user confirms or corrects the answer. These labels are what the next model learns from."""
    allowed = set(ml(request).model_info()["class_names"]) | {"other"}
    if body.label not in allowed:
        raise api_error(422, "bad_label", "Pick one of the listed item types, or 'other'.")
    scan = get_own_scan(scan_id, user, db)
    scan.user_label = body.label
    scan.labelled_at = datetime.now(UTC)
    db.commit()
    return scan_out(scan)


@router.delete("/scans/{scan_id}/photo", status_code=204)
def delete_photo(
    scan_id: uuid.UUID, request: Request, user: User | None = Depends(optional_user), db: Session = Depends(get_db)
):
    """Withdraw consent: the donated photo is deleted from disk. The model's answer stays."""
    scan = get_own_scan(scan_id, user, db)
    if scan.photo_path:
        (request.app.state.settings.media_dir / scan.photo_path).unlink(missing_ok=True)
        scan.photo_path = None
        db.commit()


@router.get("/scans", response_model=ScanPage)
def my_scans(
    before: Annotated[datetime | None, Query(description="Only scans older than this (for paging)")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    q = select(Scan).where(Scan.user_id == user.id)
    if before is not None:
        q = q.where(Scan.created_at < before)
    rows = db.scalars(q.order_by(Scan.created_at.desc()).limit(limit + 1)).all()
    items = rows[:limit]
    return {"items": [scan_out(s) for s in items], "next_before": items[-1].created_at if len(rows) > limit else None}


@router.get("/scans/summary", response_model=ScanSummary)
def my_summary(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Scans per bin for the dashboard. A scan the user re-labelled counts under the bin of their label."""
    try:
        bins: dict[str, str] = ml(request).model_info().get("bins", {})
    except HTTPException:  # ml-service down: the summary still works, re-labelled scans count as "other"
        bins = {}
    rows = db.execute(
        select(Scan.predicted_bin, Scan.predicted_class, Scan.user_label, func.count())
        .where(Scan.user_id == user.id)
        .group_by(Scan.predicted_bin, Scan.predicted_class, Scan.user_label)
    ).all()
    counts: dict[str, int] = {}
    total = labelled = 0
    for pred_bin, _, label, n in rows:
        total += n
        if label:
            labelled += n
        b = bins.get(label, "other") if label else (pred_bin or "other")
        counts[b] = counts.get(b, 0) + n
    return {
        "total": total,
        "labelled": labelled,
        "by_bin": [{"bin": b, "count": n} for b, n in sorted(counts.items(), key=lambda kv: -kv[1])],
    }
