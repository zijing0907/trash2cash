"""The main API. Everything is under /api, so one web server can serve the web app and proxy /api here.

Run locally with:  uvicorn app.main:app --reload --port 8000
"""

import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .config import Settings, load_settings
from .db import make_engine, make_sessionmaker
from .ml_client import MLClient
from .ratelimit import RateLimiter
from .routers import account, admin, auth, collector, meta, operator, public_map, scans

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

# Room for the multipart wrapping around the file when checking Content-Length
MULTIPART_OVERHEAD = 64 * 1024


def create_app(settings: Settings | None = None, ml_client: MLClient | None = None) -> FastAPI:
    """Builds the app. Tests pass their own settings and a fake ml-service; normally both come from the environment."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        s = settings or load_settings()
        app.state.settings = s
        app.state.engine = make_engine(s.database_url)
        app.state.sessionmaker = make_sessionmaker(app.state.engine)
        app.state.ml = ml_client or MLClient(s.ml_service_url, s.ml_timeout_s)
        app.state.scan_limiter = RateLimiter(s.scan_rate_per_min)
        yield
        app.state.ml.close()
        app.state.engine.dispose()

    app = FastAPI(
        title="Trash2Cash API",
        version="0.3.0",
        description="Scans, accounts, drop-off deposits, points, rewards and the admin pickup board. Calls ml-service.",
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )

    @app.middleware("http")
    async def reject_big_uploads(request: Request, call_next):
        """Refuse an oversized upload from its Content-Length header, before reading the body."""
        length = request.headers.get("content-length")
        limit = request.app.state.settings.max_upload_bytes
        too_big = length is not None and length.isdigit() and int(length) > limit + MULTIPART_OVERHEAD
        if request.method in ("POST", "PUT") and too_big:
            message = f"The file is larger than {limit / 2**20:g} MB."
            return JSONResponse({"detail": {"code": "file_too_large", "message": message}}, status_code=413)
        return await call_next(request)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        """Same {code, message} shape as every other error, with the first problem in plain words."""
        first = exc.errors()[0] if exc.errors() else {}
        field = ".".join(str(p) for p in first.get("loc", [])[1:]) or "request"
        message = f"{field}: {first.get('msg', 'invalid value')}"
        return JSONResponse({"detail": {"code": "invalid_input", "message": message, "field": field}}, status_code=422)

    api = APIRouter(prefix="/api")
    api.include_router(auth.router)
    api.include_router(scans.router)
    api.include_router(meta.router)
    api.include_router(account.router)
    api.include_router(operator.router)
    api.include_router(admin.router)
    api.include_router(collector.router)
    api.include_router(public_map.router)
    app.include_router(api)
    return app


app = create_app()
