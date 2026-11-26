"""Request and response shapes. They also produce the interactive documentation at /api/docs."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .models import Role


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=60)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    display_name: str
    role: Role
    created_at: datetime
    member_code: str
    drop_point_id: int | None


class ClassProb(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    class_name: str = Field(alias="class")
    prob: float


class ScanOut(BaseModel):
    """A stored scan. The answer comes from ml-service; user_label is what the user said it really is."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)
    id: uuid.UUID
    created_at: datetime
    model_version: str
    predicted_class: str
    predicted_bin: str | None
    confidence: float
    unsure: bool = Field(description="True: the model is not sure; ask the user to pick from top3 or retake")
    zoomed: bool
    top3: list[ClassProb]
    latency_ms: float
    top_bin: str | None = Field(default=None, description="The likeliest bin (probabilities summed per bin)")
    bin_confidence: float | None = None
    bin_unsure: bool | None = Field(
        default=None, description="False while unsure is true: the model is sure of the bin, not of the item"
    )
    user_label: str | None
    photo_donated: bool


class ScanResult(ScanOut):
    """Returned right after a scan: the stored scan plus details only needed on the result screen."""

    class_index: int = Field(description="Pass to /api/explain to see where the model looked")
    threshold: float
    crop_box: list[int] = Field(description="[left, top, right, bottom] of the part of the photo the model saw")
    battery_chance: float = Field(default=0.0, description="Probability that the item is a battery")
    battery_warning: bool = Field(default=False, description="Warn: this could be a battery, never a household bin")


class LabelIn(BaseModel):
    label: str = Field(description="One of the model's class names, or 'other' if the item fits none of them")


class ScanPage(BaseModel):
    items: list[ScanOut]
    next_before: datetime | None = Field(description="Pass as ?before= to get the next page; null on the last page")


class BinCount(BaseModel):
    bin: str
    count: int


class ScanSummary(BaseModel):
    total: int
    labelled: int
    by_bin: list[BinCount]


# ---- Milestone 3: points, rewards, deposits ------------------------------------------------------------


class StreamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    key: str = Field(description="The bin, as named in the model's meta.json, e.g. 'blue bin'")
    name: str
    points_per_kg: int
    price_sen_per_kg: int = Field(description="Buy-back price in sen (RM 0.01) per kg")


class DropPointOut(BaseModel):
    id: int
    name: str
    address: str
    lat: float
    lng: float
    is_demo: bool
    streams: list[str] = Field(description="Keys of the bins this point holds")


class CardOut(BaseModel):
    display_name: str
    member_code: str
    balance: int


class LineOut(BaseModel):
    stream_key: str
    weight_g: int
    points: int


class LedgerItem(BaseModel):
    id: int
    delta: int
    reason: str
    created_at: datetime
    point_name: str | None = None
    lines: list[LineOut] = []
    reward_name: str | None = None


class PointsPage(BaseModel):
    balance: int
    items: list[LedgerItem]
    next_before: int | None = Field(description="Pass as ?before= for older entries; null on the last page")


class RewardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str
    cost_points: int
    stock: int | None
    active: bool
    is_demo: bool


class RedemptionOut(BaseModel):
    id: uuid.UUID
    reward_name: str
    cost_points: int
    code: str
    created_at: datetime
    used_at: datetime | None = Field(default=None, description="When staff handed the reward over")


class VoucherOut(RedemptionOut):
    member_name: str
    member_code: str


class ResidentOut(BaseModel):
    display_name: str
    member_code: str
    balance: int


class DepositLineIn(BaseModel):
    stream_key: str
    weight_kg: float = Field(gt=0, le=100, description="Weighed on the scale, in kg (0.001 kg steps)")


class DepositIn(BaseModel):
    member_code: str = Field(min_length=4, max_length=12)
    point_id: int | None = Field(default=None, description="Admins only; operators use their own point")
    lines: list[DepositLineIn] = Field(min_length=1, max_length=8)


class DepositOut(BaseModel):
    id: uuid.UUID
    created_at: datetime
    points: int
    resident_name: str
    member_code: str
    point_name: str
    lines: list[LineOut]
    balance_after: int | None = None


# ---- Milestone 4: admin --------------------------------------------------------------------------------


class PickupIn(BaseModel):
    container_ids: list[int] = Field(min_length=1, max_length=50)


class JobOfferIn(BaseModel):
    point_ids: list[int] = Field(min_length=1, max_length=50, description="Drop-off points to offer, one job each")


class SkipIn(BaseModel):
    reason: str = Field(min_length=3, max_length=200, description="Why the bin could not be emptied")


class StreamIn(BaseModel):
    points_per_kg: int = Field(ge=0, le=10_000)
    price_sen_per_kg: int = Field(ge=0, le=1_000_000)


class RewardIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=200)
    cost_points: int = Field(gt=0, le=1_000_000)
    stock: int | None = Field(default=None, ge=0)
    active: bool = True


class StaffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    display_name: str
    role: Role
    drop_point_id: int | None


class RoleIn(BaseModel):
    role: Role
    drop_point_id: int | None = None


class BinIn(BaseModel):
    stream_key: str
    capacity_kg: int = Field(gt=0, le=100_000)


class DropPointIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    address: str = Field(min_length=1, max_length=200)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    active: bool = True
    bins: list[BinIn] = Field(min_length=1, max_length=10)


class BinOut(BaseModel):
    container_id: int
    stream_key: str
    capacity_kg: int


class DropPointAdmin(BaseModel):
    id: int
    name: str
    address: str
    lat: float
    lng: float
    active: bool
    is_demo: bool
    bins: list[BinOut]
