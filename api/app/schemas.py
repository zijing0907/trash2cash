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
    user_label: str | None
    photo_donated: bool


class ScanResult(ScanOut):
    """Returned right after a scan: the stored scan plus details only needed on the result screen."""

    class_index: int = Field(description="Pass to /api/explain to see where the model looked")
    threshold: float
    crop_box: list[int] = Field(description="[left, top, right, bottom] of the part of the photo the model saw")


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
