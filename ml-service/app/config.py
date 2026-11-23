"""Settings for the ML service, read from environment variables (see .env.example)."""

import os
from dataclasses import dataclass
from pathlib import Path

# ml-service/models/ when running from a checkout; Docker sets MODEL_DIR=/app/models
DEFAULT_MODEL_DIR = Path(__file__).resolve().parent.parent / "models"


@dataclass(frozen=True)
class Settings:
    model_dir: Path
    model_key: str | None  # None = pick automatically (cnn_robust if present, else cnn)
    max_upload_bytes: int
    max_image_pixels: int
    inference_timeout_s: float


def load_settings() -> Settings:
    return Settings(
        model_dir=Path(os.getenv("MODEL_DIR") or DEFAULT_MODEL_DIR),
        model_key=os.getenv("MODEL_KEY") or None,
        max_upload_bytes=int(float(os.getenv("MAX_UPLOAD_MB", "8")) * 1024 * 1024),
        max_image_pixels=int(float(os.getenv("MAX_IMAGE_MEGAPIXELS", "60")) * 1_000_000),
        inference_timeout_s=float(os.getenv("INFERENCE_TIMEOUT_S", "30")),
    )
