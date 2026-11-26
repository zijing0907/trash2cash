"""Database tables. Milestone 2: users and scans. Milestone 3: drop-off points, deposits weighed by an operator,
the points ledger and rewards. Milestone 4: pickups, which the admin board forecasts."""

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, Enum, Float, ForeignKey, Index, Integer, String, UniqueConstraint, Uuid
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
    # Shown as a QR code on the member card; an operator scans or types it. Random, so it reveals nothing.
    member_code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    # Operators only: the drop-off point they weigh deposits at
    drop_point_id: Mapped[int | None] = mapped_column(ForeignKey("drop_points.id", ondelete="SET NULL"))

    scans: Mapped[list["Scan"]] = relationship(back_populates="user")
    drop_point: Mapped["DropPoint | None"] = relationship()


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
    # Bin-level answer (Phase 2): the likeliest bin, its probability, and whether that is below the threshold.
    # When unsure is true but bin_unsure is false, the app named the bin without naming the item.
    # NULL for scans made before it existed.
    top_bin: Mapped[str | None] = mapped_column(String(40))
    bin_confidence: Mapped[float | None] = mapped_column(Float)
    bin_unsure: Mapped[bool | None] = mapped_column(Boolean)

    # What the user said the item really is: a class name, or "other" for items outside the 12 classes.
    # These labels (with donated photos) are the material for retraining.
    user_label: Mapped[str | None] = mapped_column(String(40))
    labelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    photo_path: Mapped[str | None] = mapped_column(String(200))  # file name inside MEDIA_DIR

    user: Mapped[User | None] = relationship(back_populates="scans")


# ---- Milestone 3 and 4: drop-off points, deposits, points, rewards, pickups -------------------------------


class Stream(Base):
    """A recycling stream: one per bin that a drop-off point can hold (blue, brown, orange, e-waste, textile).
    `key` is the bin name the model's meta.json uses. Points and buy-back price are set by an admin."""

    __tablename__ = "streams"

    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(60))  # what goes in it, e.g. "Paper and cardboard"
    points_per_kg: Mapped[int] = mapped_column(Integer)
    price_sen_per_kg: Mapped[int] = mapped_column(Integer)  # buy-back price in sen (RM 0.01) per kg
    sort: Mapped[int] = mapped_column(Integer, default=0)


class DropPoint(Base):
    __tablename__ = "drop_points"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    address: Mapped[str] = mapped_column(String(200))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)  # created by the demo seed; the UI says so

    containers: Mapped[list["Container"]] = relationship(back_populates="point", order_by="Container.id")


class Container(Base):
    """One bin at a drop-off point. Its fill is the weight deposited since it was last emptied."""

    __tablename__ = "containers"
    __table_args__ = (UniqueConstraint("point_id", "stream_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    point_id: Mapped[int] = mapped_column(ForeignKey("drop_points.id", ondelete="CASCADE"))
    stream_key: Mapped[str] = mapped_column(ForeignKey("streams.key"))
    capacity_kg: Mapped[int] = mapped_column(Integer)
    emptied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    point: Mapped[DropPoint] = relationship(back_populates="containers")
    stream: Mapped[Stream] = relationship()


class Deposit(Base):
    """Items a resident handed in, weighed and confirmed by an operator. Only this earns points."""

    __tablename__ = "deposits"
    __table_args__ = (Index("ix_deposits_point_created", "point_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    point_id: Mapped[int] = mapped_column(ForeignKey("drop_points.id"))
    resident_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    operator_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    points: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    lines: Mapped[list["DepositLine"]] = relationship(back_populates="deposit", order_by="DepositLine.id")
    point: Mapped[DropPoint] = relationship()
    resident: Mapped[User] = relationship(foreign_keys=[resident_id])


class DepositLine(Base):
    __tablename__ = "deposit_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    deposit_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("deposits.id", ondelete="CASCADE"), index=True)
    stream_key: Mapped[str] = mapped_column(ForeignKey("streams.key"))
    weight_g: Mapped[int] = mapped_column(Integer)  # grams, so no rounding drifts in sums
    points: Mapped[int] = mapped_column(Integer)

    deposit: Mapped[Deposit] = relationship(back_populates="lines")


class LedgerReason(enum.StrEnum):
    deposit = "deposit"
    redemption = "redemption"
    adjustment = "adjustment"


class LedgerEntry(Base):
    """Append-only: a balance is the sum of a user's entries, never a number that is overwritten."""

    __tablename__ = "points_ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    delta: Mapped[int] = mapped_column(Integer)
    reason: Mapped[LedgerReason] = mapped_column(Enum(LedgerReason, name="ledger_reason", native_enum=False, length=20))
    deposit_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("deposits.id"))
    redemption_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("redemptions.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Reward(Base):
    __tablename__ = "rewards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(200), default="")
    cost_points: Mapped[int] = mapped_column(Integer)
    stock: Mapped[int | None] = mapped_column(Integer)  # None = unlimited
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class Redemption(Base):
    """A reward claimed with points. The code is what the resident shows to collect it."""

    __tablename__ = "redemptions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    reward_id: Mapped[int] = mapped_column(ForeignKey("rewards.id"))
    cost_points: Mapped[int] = mapped_column(Integer)
    code: Mapped[str] = mapped_column(String(12), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Set once, when staff hand the reward over; a code can never be collected twice
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    used_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    reward: Mapped[Reward] = relationship()
    user: Mapped[User] = relationship(foreign_keys=[user_id])


class Pickup(Base):
    """A container emptied by the collection truck."""

    __tablename__ = "pickups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    container_id: Mapped[int] = mapped_column(ForeignKey("containers.id", ondelete="CASCADE"), index=True)
    collected_g: Mapped[int] = mapped_column(Integer)
    by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
