"""A small per-IP limit for the expensive endpoints (every scan runs the CNN on a CPU).

Sliding window in memory: enough for one API process, which is how the demo runs. With several
processes or servers this would move to Redis.
"""

import threading
import time
from collections import defaultdict, deque

from fastapi import Request

from .errors import api_error


class RateLimiter:
    def __init__(self, per_minute: int):
        self.per_minute = per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        if self.per_minute <= 0:
            return
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > 60:
                hits.popleft()
            if len(hits) >= self.per_minute:
                retry = int(60 - (now - hits[0])) + 1
                raise api_error(
                    429, "rate_limited", f"Too many scans. Try again in {retry} s.", headers={"Retry-After": str(retry)}
                )
            hits.append(now)
            if len(self._hits) > 10_000:  # forget idle clients so memory stays bounded
                for k in [k for k, v in self._hits.items() if not v or now - v[-1] > 60]:
                    del self._hits[k]


def client_ip(request: Request) -> str:
    if request.app.state.settings.trust_proxy:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[-1].strip()  # the address our own proxy saw
    return request.client.host if request.client else "unknown"


def limit_scans(request: Request) -> None:
    request.app.state.scan_limiter.check(client_ip(request))
