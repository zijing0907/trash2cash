"""The public map (Phase 4): every open drop-off point, how full its bins are, and how the app knows."""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ..board import point_statuses
from ..db import get_db
from ..models import User
from ..security import optional_user

router = APIRouter(tags=["map"])
KEEP = ("stream_key", "stream_name", "capacity_kg", "fill_kg", "est_fill_kg", "fill_ratio", "correction",
        "rate_kg_per_day", "full_on", "status", "due_because")  # fmt: skip


def bin_out(b: dict) -> dict:
    rep = b["reports"]
    return {
        **{k: b[k] for k in KEEP},
        "last_deposit_at": b["last_deposit_at"],
        "emptied_at": b["last_pickup_at"],
        # Who reported stays private; photos are for admins
        "reports": {k: v for k, v in rep.items() if k != "photo_ids"} if rep else None,
    }


@router.get("/map")
def drop_off_map(request: Request, user: User | None = Depends(optional_user), db: Session = Depends(get_db)):
    """For each bin: the fill, which is the sum of weighed drop-offs since it was last emptied (no sensors), when it
    was last weighed into or emptied, and the forecast. The web app labels each with how it is known."""
    tz = ZoneInfo(request.app.state.settings.timezone)
    points = point_statuses(db, tz, datetime.now(UTC), viewer_id=user.id if user else None)
    return {
        "generated_at": datetime.now(UTC),
        "points": [
            {
                **{k: p[k] for k in ("id", "name", "address", "lat", "lng", "is_demo", "status")},
                "bins": [bin_out(b) for b in p["bins"]],
            }
            for p in points
        ],
    }
