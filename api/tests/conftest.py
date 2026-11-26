"""Shared fixtures.

ml-service is replaced by an httpx MockTransport (FakeML), so the API tests need neither TensorFlow nor
a model, and each test can make the "service" answer, fail or time out.

The database is an in-memory SQLite by default. Set TEST_DATABASE_URL to a PostgreSQL URL to run the
same tests against PostgreSQL (CI does this).
"""

import os
from collections.abc import Callable
from pathlib import Path

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from app.config import Settings
from app.db import Base
from app.main import create_app
from app.ml_client import MLClient

CLASS_NAMES = [
    "battery", "biological", "brown-glass", "cardboard", "clothes", "green-glass",
    "metal", "paper", "plastic", "shoes", "trash", "white-glass",
]  # fmt: skip
BINS = {
    "paper": "blue bin", "cardboard": "blue bin",
    "brown-glass": "brown bin", "green-glass": "brown bin", "white-glass": "brown bin",
    "plastic": "orange bin", "metal": "orange bin",
    "battery": "e-waste collection", "clothes": "textile donation", "shoes": "textile donation",
    "biological": "food waste", "trash": "general waste",
}  # fmt: skip
MODEL_INFO = {
    "key": "cnn_robust",
    "run": "CNN-R-test",
    "version": "CNN-R-test@deadbeef",
    "class_names": CLASS_NAMES,
    "img_size": 128,
    "bins": BINS,
    "threshold": 0.5,
    "use_tta": False,
    "gradcam_layer": "block4b_relu",
    "metrics": {"test_macro_f1": 0.9},
    "available_models": ["cnn_robust"],
    "dataset": "test",
    "quick_run": False,
    "preprocessing": "test",
}
DATABASE_URL = os.getenv("TEST_DATABASE_URL") or "sqlite://"  # empty also means SQLite


def prediction(top: str = "plastic", confidence: float = 0.91, unsure: bool = False) -> dict:
    """A /predict answer shaped exactly like ml-service's."""
    others = [c for c in CLASS_NAMES if c != top]
    rest = (1 - confidence) / 2
    return {
        "model_version": MODEL_INFO["version"],
        "top3": [
            {"class": top, "prob": confidence},
            {"class": others[0], "prob": rest},
            {"class": others[1], "prob": rest},
        ],
        "class_index": CLASS_NAMES.index(top),
        "bin": BINS[top],
        "confidence": confidence,
        "unsure": unsure,
        "threshold": 0.5,
        "crop_box": [0, 0, 100, 100],
        "zoomed": False,
        "tta": False,
        "probs": {c: 0.0 for c in CLASS_NAMES},
        "dhash": "0123456789abcdef",
        "latency_ms": 42.0,
    }


class FakeML:
    """Stands in for ml-service. Set `handler` to change how it answers; `calls` records every request."""

    def __init__(self):
        self.calls: list[httpx.Request] = []
        self.handler: Callable[[httpx.Request], httpx.Response] = self.default

    def default(self, request: httpx.Request) -> httpx.Response:
        if request.url.path == "/predict":
            return httpx.Response(200, json=prediction())
        if request.url.path == "/explain":
            return httpx.Response(200, content=b"\x89PNG fake", headers={"X-Class": "plastic", "X-Class-Index": "8"})
        if request.url.path == "/model":
            return httpx.Response(200, json=MODEL_INFO)
        if request.url.path == "/health":
            return httpx.Response(200, json={"status": "ok", "model_version": MODEL_INFO["version"]})
        return httpx.Response(404)

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        return self.handler(request)

    def paths(self) -> list[str]:
        return [r.url.path for r in self.calls]


def make_settings(tmp_path: Path, **overrides) -> Settings:
    values = dict(
        database_url=DATABASE_URL,
        ml_service_url="http://ml-service",
        secret_key="test-secret-key-that-is-long-enough-for-hs256",
        cookie_secure=False,
        session_days=7,
        max_upload_bytes=1024 * 1024,
        ml_timeout_s=5.0,
        media_dir=tmp_path / "media",
        scan_rate_per_min=0,
        trust_proxy=False,
    )
    values.update(overrides)
    return Settings(**values)


@pytest.fixture(autouse=True)
def fresh_database():
    """Every test starts with empty tables."""
    engine = create_engine(DATABASE_URL) if DATABASE_URL != "sqlite://" else None
    if engine is not None:
        Base.metadata.drop_all(engine)
        Base.metadata.create_all(engine)
        engine.dispose()
    yield


@pytest.fixture
def fake_ml() -> FakeML:
    return FakeML()


@pytest.fixture
def make_client(tmp_path, fake_ml):
    """Builds a TestClient; keyword arguments override settings (e.g. scan_rate_per_min=2)."""
    clients = []

    def build(**overrides) -> TestClient:
        settings = make_settings(tmp_path, **overrides)
        ml = MLClient(settings.ml_service_url, settings.ml_timeout_s, transport=httpx.MockTransport(fake_ml))
        client = TestClient(create_app(settings, ml)).__enter__()
        if settings.database_url == "sqlite://":  # in-memory: create the tables on the app's own engine
            Base.metadata.create_all(client.app.state.engine)
        clients.append(client)
        return client

    yield build
    for c in clients:
        c.__exit__(None, None, None)


@pytest.fixture
def client(make_client) -> TestClient:
    return make_client()


def photo(n_bytes: int = 2000) -> bytes:
    """Bytes that look like a JPEG. The API never decodes photos itself (ml-service does), so any bytes do."""
    return b"\xff\xd8\xff\xe0" + b"\x00" * n_bytes


def upload(data: bytes | None = None, name: str = "item.jpg", ctype: str = "image/jpeg") -> dict:
    return {"file": (name, data if data is not None else photo(), ctype)}


def register(client: TestClient, email: str = "aina@example.com", password: str = "correct horse", name: str = "Aina"):
    r = client.post("/api/auth/register", json={"email": email, "password": password, "display_name": name})
    assert r.status_code == 201, r.text
    return r.json()
