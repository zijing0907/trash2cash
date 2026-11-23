"""Database tables. Milestone 2: users and scans. Deposits, the points ledger and rewards come in Milestone 3."""

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, Enum, Float, ForeignKey, Index, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class Role(enum.StrEnum):
    resident = "resident"  # scans items, earns points (Milestone 3)
    operator = "operator"  # weighs and verifies deposits at a drop-off point (Milestone 3)
    admin = "admin"  # sees every drop-off point and the pickup forecast (Milestone 4)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)  # stored lower-case
    display_name: Mapped[str] = mapped_column(String(60))
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[Role] = mapped_column(
        Enum(Role, name="user_role", native_enum=False, length=20), default=Role.resident
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    scans: Mapped[list["Scan"]] = relationship(back_populates="user")


class Scan(Base):
    """One photo classified by the model. Guests can scan too (user_id is then NULL).

    The photo itself is stored only if the user ticked "donate this photo" (photo_path); otherwise only
    the model's answer and a 64-bit difference hash are kept, so the photo cannot be rebuilt.
    """

    __tablename__ = "scans"
    __table_args__ = (Index("ix_scans_user_created", "user_id", "created_at"),)

    # A random UUID, not a counter: scan ids appear in URLs and must not be guessable
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    # The model's answer, exactly as ml-service returned it
    model_version: Mapped[str] = mapped_column(String(80))
    predicted_class: Mapped[str] = mapped_column(String(40))
    predicted_bin: Mapped[str | None] = mapped_column(String(40))
    confidence: Mapped[float] = mapped_column(Float)
    unsure: Mapped[bool] = mapped_column(Boolean)
    zoomed: Mapped[bool] = mapped_column(Boolean, default=False)
    top3: Mapped[list[dict]] = mapped_column(JSON)
    dhash: Mapped[str] = mapped_column(String(16))
    latency_ms: Mapped[float] = mapped_column(Float)

    # What the user said the item really is: a class name, or "other" for items outside the 12 classes.
    # These labels (with donated photos) are the material for retraining.
    user_label: Mapped[str | None] = mapped_column(String(40))
    labelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    photo_path: Mapped[str | None] = mapped_column(String(200))  # file name inside MEDIA_DIR

    user: Mapped[User | None] = relationship(back_populates="scans")
