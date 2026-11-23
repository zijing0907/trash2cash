"""HTTP API of the ML service.

Only the main API (api/) should call this service; the web app never talks to it directly.
Run locally with:  uvicorn app.main:app --port 8001
"""

import asyncio
import logging
import time
from collections.abc import Callable
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import APIRouter, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field

from .config import Settings, load_settings
from .model import WasteClassifier
from .preprocessing import ImageRejected, open_photo

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)

# Room for the multipart wrapping around the file (boundaries, headers) when checking Content-Length
MULTIPART_OVERHEAD = 64 * 1024

# HTTP status for each ImageRejected code from preprocessing.py
STATUS_FOR_CODE = {"empty_file": 422, "unsupported_format": 415, "image_too_large": 413, "corrupt_image": 422}


def api_error(status: int, code: str, message: str) -> HTTPException:
    """All errors look like {"detail": {"code": "...", "message": "..."}}, so the web app can show a clear message."""
    return HTTPException(status_code=status, detail={"code": code, "message": message})


# ---- response shapes (they also produce the documentation at /docs) ----------------------


class ClassProb(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    class_name: str = Field(alias="class", description="Class name, e.g. 'plastic'")
    prob: float


class PredictResponse(BaseModel):
    model_version: str = Field(description="Run name + short hash of the model file; store it with the scan")
    top3: list[ClassProb] = Field(description="The three most likely classes, most likely first")
    class_index: int = Field(description="Index of the top class in class_names (pass it to /explain)")
    bin: str | None = Field(description="Where the top class goes, from meta.json (show it only if unsure is false)")
    confidence: float = Field(description="Probability of the top class")
    unsure: bool = Field(description="True if confidence < threshold: ask the user to pick from top3 or retake")
    threshold: float
    crop_box: list[int] = Field(description="[left, top, right, bottom] of the part of the photo the model saw")
    zoomed: bool = Field(description="True if zoom search picked the crop; its confidence is not calibrated")
    tta: bool = Field(description="Whether test-time augmentation was used")
    probs: dict[str, float] = Field(description="Probability of every class")
    dhash: str = Field(description="Difference hash of the photo (16 hex characters), for the repeat-photo flag")
    latency_ms: float


class ModelResponse(BaseModel):
    key: str
    run: str
    version: str
    class_names: list[str]
    img_size: int
    bins: dict[str, str]
    threshold: float
    use_tta: bool
    gradcam_layer: str
    metrics: dict[str, float] = Field(description="Test-set metrics exactly as stored in meta.json")
    available_models: list[str]
    dataset: str | None
    quick_run: bool
    preprocessing: str | None


class HealthResponse(BaseModel):
    status: str
    model_version: str


# ---- helpers ---------------------------------------------------------------------------


async def read_upload(request: Request, file: UploadFile) -> bytes:
    limit = request.app.state.settings.max_upload_bytes
    data = await file.read(limit + 1)  # one byte more than allowed tells us the file is too big
    if len(data) > limit:
        raise api_error(413, "file_too_large", f"The file is larger than {limit / 2**20:g} MB.")
    return data


async def run_with_timeout(request: Request, job: Callable[[], Any]) -> Any:
    """Runs job() in a worker thread, so a slow prediction does not block other requests.

    After the timeout the client gets HTTP 504 at once. TensorFlow cannot be stopped half way, so the
    thread still finishes in the background; the timeout protects the caller, not the CPU.
    """
    timeout = request.app.state.settings.inference_timeout_s
    try:
        return await asyncio.wait_for(asyncio.to_thread(job), timeout)
    except TimeoutError:
        raise api_error(504, "timeout", f"The model took longer than {timeout:g} s. Please try again.") from None
    except ImageRejected as e:
        raise api_error(STATUS_FOR_CODE[e.code], e.code, e.message) from None


# ---- endpoints -------------------------------------------------------------------------

router = APIRouter()
UploadedPhoto = Annotated[UploadFile, File(description="Photo of one item: JPEG, PNG, WebP or HEIC")]


@router.get("/health", response_model=HealthResponse)
def health(request: Request):
    return {"status": "ok", "model_version": request.app.state.classifier.version}


@router.get("/model", response_model=ModelResponse)
def model_info(request: Request):
    clf: WasteClassifier = request.app.state.classifier
    return {
        "key": clf.key,
        "run": clf.info["run"],
        "version": clf.version,
        "class_names": clf.class_names,
        "img_size": clf.img_size,
        "bins": clf.bins,
        "threshold": clf.threshold,
        "use_tta": clf.use_tta,
        "gradcam_layer": clf.gradcam_layer,
        "metrics": clf.metrics,
        "available_models": clf.available_keys,
        "dataset": clf.meta.get("dataset"),
        "quick_run": bool(clf.meta.get("quick_run", False)),
        "preprocessing": clf.meta.get("preprocessing"),
    }


@router.post("/predict", response_model=PredictResponse)
async def predict(
    request: Request,
    file: UploadedPhoto,
    zoom: Annotated[bool, Query(description="Search for the item in a big photo (slower, not calibrated)")] = False,
    tta: Annotated[bool | None, Query(description="Test-time augmentation; empty = use_tta from meta.json")] = None,
):
    t0 = time.perf_counter()
    data = await read_upload(request, file)
    clf: WasteClassifier = request.app.state.classifier
    max_pixels = request.app.state.settings.max_image_pixels

    def job() -> dict:
        return clf.classify(open_photo(data, max_pixels), zoom=zoom, tta=tta)

    result = await run_with_timeout(request, job)
    result["latency_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    return result


@router.post(
    "/explain",
    response_class=Response,
    responses={200: {"content": {"image/png": {}}, "description": "Grad-CAM heat map over the model input"}},
)
async def explain(
    request: Request,
    file: UploadedPhoto,
    class_index: Annotated[int | None, Query(ge=0, description="Class to explain; empty = the top class")] = None,
    zoom: Annotated[bool, Query(description="Use the same value as in /predict")] = False,
):
    clf: WasteClassifier = request.app.state.classifier
    if class_index is not None and class_index >= len(clf.class_names):
        raise api_error(422, "bad_class_index", f"class_index must be below {len(clf.class_names)}.")
    data = await read_upload(request, file)
    max_pixels = request.app.state.settings.max_image_pixels

    def job() -> tuple[bytes, int]:
        return clf.explain_png(open_photo(data, max_pixels), class_index, zoom=zoom)

    png, k = await run_with_timeout(request, job)
    headers = {"X-Model-Version": clf.version, "X-Class-Index": str(k), "X-Class": clf.class_names[k]}
    return Response(png, media_type="image/png", headers=headers)


# ---- app -------------------------------------------------------------------------------


def create_app(settings: Settings | None = None) -> FastAPI:
    """Builds the app. Tests pass their own Settings; normally they come from environment variables."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        s = settings or load_settings()
        app.state.settings = s
        # Load the model once, before the first request. If it is missing, start-up fails with a
        # clear message instead of the service running without a model.
        app.state.classifier = WasteClassifier.load(s.model_dir, s.model_key)
        yield

    app = FastAPI(
        title="Trash2Cash ML service",
        version="0.1.0",
        description="Waste classifier trained from scratch (UECS2523). Internal service: called by the main API.",
        lifespan=lifespan,
    )

    @app.middleware("http")
    async def reject_big_uploads(request: Request, call_next):
        """Refuse an oversized upload from its Content-Length header, before reading the body.
        (read_upload checks again, for clients that send no Content-Length.)"""
        length = request.headers.get("content-length")
        limit = request.app.state.settings.max_upload_bytes
        if request.method == "POST" and length and length.isdigit() and int(length) > limit + MULTIPART_OVERHEAD:
            message = f"The file is larger than {limit / 2**20:g} MB."
            return JSONResponse({"detail": {"code": "file_too_large", "message": message}}, status_code=413)
        return await call_next(request)

    app.include_router(router)
    return app


app = create_app()
