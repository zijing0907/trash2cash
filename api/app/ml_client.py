"""Calls ml-service over internal HTTP and turns its failures into clear API errors."""

import logging
import threading
import time
from typing import Any

import httpx2 as httpx

from .errors import api_error

log = logging.getLogger(__name__)

MODEL_INFO_TTL_S = 300  # /model rarely changes (only when ml-service is redeployed)


class MLClient:
    def __init__(self, base_url: str, timeout_s: float, transport: httpx.BaseTransport | None = None):
        # transport is for tests (httpx.MockTransport); normally real HTTP
        self._http = httpx.Client(base_url=base_url, timeout=timeout_s, transport=transport)
        self._model_info: tuple[float, dict] | None = None
        self._lock = threading.Lock()

    def close(self) -> None:
        self._http.close()

    def _send(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        try:
            r = self._http.request(method, path, **kwargs)
        except httpx.TimeoutException:
            raise api_error(504, "timeout", "The classifier took too long. Please try again.") from None
        except httpx.TransportError as e:
            log.warning("ml-service unreachable: %s", e)
            raise api_error(
                503, "ml_unavailable", "The classifier is starting up or unavailable. Try again in a minute."
            ) from None
        if r.status_code < 400:
            return r
        # ml-service errors are already {code, message} with a fitting status (413, 415, 422, 504): pass them on
        try:
            detail = r.json()["detail"]
            if 400 <= r.status_code < 500 or r.status_code == 504:
                raise api_error(r.status_code, detail["code"], detail["message"])
        except (ValueError, KeyError, TypeError):
            pass
        log.error("ml-service %s %s -> HTTP %s", method, path, r.status_code)
        raise api_error(503, "ml_unavailable", "The classifier had a problem. Please try again.")

    @staticmethod
    def _files(data: bytes, filename: str, content_type: str) -> dict:
        return {"file": (filename or "photo", data, content_type or "application/octet-stream")}

    def predict(self, data: bytes, filename: str, content_type: str, zoom: bool) -> dict:
        r = self._send("POST", "/predict", params={"zoom": zoom}, files=self._files(data, filename, content_type))
        return r.json()

    def explain(
        self, data: bytes, filename: str, content_type: str, class_index: int | None, zoom: bool
    ) -> tuple[bytes, dict[str, str]]:
        params: dict[str, Any] = {"zoom": zoom}
        if class_index is not None:
            params["class_index"] = class_index
        r = self._send("POST", "/explain", params=params, files=self._files(data, filename, content_type))
        keep = ("x-class", "x-class-index", "x-model-version")
        return r.content, {k: v for k, v in r.headers.items() if k.lower() in keep}

    def model_info(self) -> dict:
        with self._lock:
            if self._model_info and time.monotonic() - self._model_info[0] < MODEL_INFO_TTL_S:
                return self._model_info[1]
        info = self._send("GET", "/model").json()
        with self._lock:
            self._model_info = (time.monotonic(), info)
        return info

    def health(self) -> dict | None:
        try:
            r = self._http.get("/health", timeout=3)
            return r.json() if r.status_code == 200 else None
        except httpx.HTTPError:
            return None
