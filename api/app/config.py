"""Settings for the main API, read from environment variables (see the repo's .env.example)."""

import logging
import os
import secrets
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)


def _bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    return default if value is None or value == "" else value.strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Settings:
    database_url: str
    ml_service_url: str
    secret_key: str  # signs the session cookie; must stay the same across restarts in production
    cookie_secure: bool  # True behind HTTPS: the browser then only sends the cookie over HTTPS
    session_days: int
    max_upload_bytes: int
    ml_timeout_s: float
    media_dir: Path  # photos users chose to donate
    scan_rate_per_min: int  # per client IP; 0 = no limit
    trust_proxy: bool  # read the client IP from X-Forwarded-For (only behind our own nginx)


def load_settings() -> Settings:
    secret = os.getenv("SECRET_KEY", "")
    if not secret:
        # Fine for development: sessions simply end when the API restarts.
        secret = secrets.token_urlsafe(32)
        log.warning("SECRET_KEY is not set: using a random key, so everyone is logged out on restart.")
    return Settings(
        database_url=os.getenv("DATABASE_URL", "postgresql+psycopg://trash2cash:trash2cash@localhost:5432/trash2cash"),
        ml_service_url=os.getenv("ML_SERVICE_URL", "http://localhost:8001").rstrip("/"),
        secret_key=secret,
        cookie_secure=_bool("COOKIE_SECURE", False),
        session_days=int(os.getenv("SESSION_DAYS", "7")),
        max_upload_bytes=int(float(os.getenv("MAX_UPLOAD_MB", "8")) * 1024 * 1024),
        ml_timeout_s=float(os.getenv("ML_TIMEOUT_S", "35")),
        media_dir=Path(os.getenv("MEDIA_DIR", "media")),
        scan_rate_per_min=int(os.getenv("SCAN_RATE_PER_MIN", "20")),
        trust_proxy=_bool("TRUST_PROXY", False),
    )
