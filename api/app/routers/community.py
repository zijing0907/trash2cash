"""The community page (Phase 7). Public: totals over places, bins and items only."""

from datetime import UTC, datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import community
from ..db import get_db
from ..errors import api_error
from ..models import DropPoint

router = APIRouter(tags=["community"])


@router.get("/community")
def community_page(request: Request, db: Session = Depends(get_db)):
    """What was recycled this month and over the last eight weeks, by place and by bin."""
    return community.recycled(db, ZoneInfo(request.app.state.settings.timezone), datetime.now(UTC))


@router.get("/community/confusion")
def confusion(
    point_id: Annotated[int | None, Query(description="Only residents whose usual drop-off point this is")] = None,
    db: Session = Depends(get_db),
):
    """What people find confusing, from the last 90 days of scans by signed-in residents."""
    if point_id is not None and db.scalar(select(DropPoint.id).where(DropPoint.id == point_id)) is None:
        raise api_error(404, "point_not_found", "Drop-off point not found.")
    return community.confusion(db, datetime.now(UTC), point_id)
