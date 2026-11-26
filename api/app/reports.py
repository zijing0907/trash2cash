"""Reports from the public (Phase 6), like Waze: anyone signed in can say a bin is full or overflowing.

One report is a hint. Reports from CONFIRM_PEOPLE different people within REPORT_HOURS, since the bin was last
emptied, make the bin due on the admin's board. Each person can report a bin once every COOLDOWN_HOURS and at most
DAILY_LIMIT times a day, and an emptied bin starts again from no reports.
"""

import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .errors import api_error
from .jobs import photo_kind
from .models import BinReport, Container, DropPoint, ReportLevel, User

REPORT_HOURS = 24
CONFIRM_PEOPLE = 3
COOLDOWN_HOURS = 6
DAILY_LIMIT = 20


def as_utc(t: datetime) -> datetime:
    return t if t.tzinfo else t.replace(tzinfo=UTC)  # SQLite keeps times without a zone; they are UTC


def report_bin(
    db: Session,
    user: User,
    point_id: int,
    stream_key: str,
    level: ReportLevel,
    photo: bytes | None,
    media_dir: Path,
    now: datetime,
) -> BinReport:
    container = db.scalars(
        select(Container)
        .join(DropPoint, DropPoint.id == Container.point_id)
        .where(Container.point_id == point_id, Container.stream_key == stream_key, DropPoint.active)
    ).first()
    if container is None:
        raise api_error(404, "bin_not_found", "That bin is not at this drop-off point, or the point is closed.")
    last = db.scalar(
        select(func.max(BinReport.created_at)).where(
            BinReport.container_id == container.id, BinReport.user_id == user.id
        )
    )
    if last is not None and now - as_utc(last) < timedelta(hours=COOLDOWN_HOURS):
        raise api_error(409, "already_reported", "You reported this bin recently. Thank you, once is enough.")
    today = db.scalar(
        select(func.count(BinReport.id)).where(
            BinReport.user_id == user.id, BinReport.created_at >= now - timedelta(days=1)
        )
    )
    if today >= DAILY_LIMIT:
        raise api_error(429, "too_many_reports", "That is a lot of reports for one day. Please try again tomorrow.")
    name = None
    if photo:
        kind = photo_kind(photo)
        if kind is None:
            raise api_error(422, "not_a_photo", "The photo must be a JPEG, PNG, WebP or HEIC image.")
        name = f"report-{uuid.uuid4()}{kind[0]}"
        media_dir.mkdir(parents=True, exist_ok=True)
        (media_dir / name).write_bytes(photo)
    report = BinReport(container_id=container.id, user_id=user.id, level=level, photo_path=name, created_at=now)
    db.add(report)
    db.flush()
    return report


def active_reports(db: Session, containers: list[Container], now: datetime, viewer_id: int | None) -> dict[int, dict]:
    """Per container: the reports that still count (since it was emptied, within REPORT_HOURS)."""
    emptied = {c.id: as_utc(c.emptied_at) if c.emptied_at else None for c in containers}
    rows = db.execute(
        select(BinReport.id, BinReport.container_id, BinReport.user_id, BinReport.level, BinReport.created_at,
               BinReport.photo_path)
        .where(BinReport.container_id.in_(list(emptied)), BinReport.created_at >= now - timedelta(hours=REPORT_HOURS))
        .order_by(BinReport.created_at)
    ).all()  # fmt: skip
    out: dict[int, dict] = {}
    for rid, cid, uid, level, created, photo in rows:
        at = as_utc(created)
        if emptied[cid] is not None and at <= emptied[cid]:
            continue  # reported before the last pickup: that bin has been emptied since
        r = out.setdefault(cid, {"people": set(), "last_at": at, "overflowing": False, "mine": False, "photos": []})
        r["people"].add(uid)
        r["last_at"] = at
        r["overflowing"] = r["overflowing"] or level == ReportLevel.overflowing
        r["mine"] = r["mine"] or (viewer_id is not None and uid == viewer_id)
        if photo:
            r["photos"].append(rid)
    return {
        cid: {
            "count": len(r["people"]),
            "last_at": r["last_at"],
            "overflowing": r["overflowing"],
            "confirmed": len(r["people"]) >= CONFIRM_PEOPLE,
            "mine": r["mine"],
            "photo_ids": r["photos"],
        }
        for cid, r in out.items()
    }
