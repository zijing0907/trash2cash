"""Reports from the public that a bin is full (Phase 6)."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import reports
from ..db import get_db
from ..errors import api_error
from ..jobs import MEDIA_TYPES
from ..models import BinReport, ReportLevel, Role, User
from ..security import current_user, require_role
from .scans import read_upload

router = APIRouter(tags=["reports"])


@router.post("/reports", status_code=201)
def report_full_bin(
    request: Request,
    point_id: Annotated[int, Form()],
    stream_key: Annotated[str, Form(max_length=40, description="The bin, e.g. 'blue bin'")],
    level: Annotated[ReportLevel, Form()] = ReportLevel.full,
    photo: Annotated[UploadFile | None, File(description="Optional photo of the bin")] = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Say a bin is full or overflowing. Signed-in people only, once per bin every few hours."""
    data = read_upload(request, photo) if photo is not None and photo.filename else None
    report = reports.report_bin(
        db, user, point_id, stream_key, level, data, request.app.state.settings.media_dir, datetime.now(UTC)
    )
    db.commit()
    return {"id": report.id, "level": report.level, "created_at": report.created_at}


@router.get("/reports/{report_id}/photo", response_class=FileResponse)
def report_photo(
    request: Request, report_id: int, user: User = Depends(require_role(Role.admin)), db: Session = Depends(get_db)
):
    report = db.get(BinReport, report_id)
    path = request.app.state.settings.media_dir / report.photo_path if report and report.photo_path else None
    if path is None or not path.is_file():
        raise api_error(404, "photo_not_found", "Photo not found.")
    return FileResponse(path, media_type=MEDIA_TYPES.get(path.suffix, "application/octet-stream"),
                        headers={"Cache-Control": "private, max-age=3600"})  # fmt: skip
