"""Rate limiter and security event tracker."""
from __future__ import annotations

import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Deque, Dict, List, Optional

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.utils.config import get_settings


@dataclass
class RequestRecord:
    timestamp: float
    endpoint: str
    method: str
    status_code: int
    latency_ms: float
    ip: str
    event_type: str = "REQUEST"
    severity: str = "INFO"
    message: str = ""


# ─── Shared in-process state ──────────────────────────────────────────────────

class SecurityStore:
    """Thread-safe (GIL-protected) security event store."""

    def __init__(self) -> None:
        self.request_timestamps: Dict[str, Deque[float]] = defaultdict(lambda: deque())
        self.all_requests: Deque[RequestRecord] = deque(maxlen=500)
        self.blocked_count: int = 0
        self.rate_limit_events: int = 0
        self.invalid_uploads: int = 0
        self.suspicious_requests: int = 0
        self.api_errors: int = 0
        self.latencies: Deque[float] = deque(maxlen=200)

    def record(self, rec: RequestRecord) -> None:
        self.all_requests.appendleft(rec)
        if rec.latency_ms > 0:
            self.latencies.append(rec.latency_ms)
        if rec.event_type == "RATE_LIMITED":
            self.blocked_count += 1
            self.rate_limit_events += 1
        if rec.event_type == "INVALID_UPLOAD":
            self.invalid_uploads += 1
        if rec.event_type == "SUSPICIOUS":
            self.suspicious_requests += 1
        if rec.status_code >= 500:
            self.api_errors += 1

    def recent_events(self, limit: int = 50) -> List[RequestRecord]:
        return list(self.all_requests)[:limit]

    def requests_per_minute(self, ip: Optional[str] = None) -> float:
        now = time.time()
        window = 60.0
        if ip:
            ts = self.request_timestamps[ip]
            return sum(1 for t in ts if now - t < window)
        # Global
        total = sum(
            sum(1 for t in ts if now - t < window)
            for ts in self.request_timestamps.values()
        )
        return float(total)

    def avg_latency(self) -> float:
        if not self.latencies:
            return 0.0
        return sum(self.latencies) / len(self.latencies)

    def p95_latency(self) -> float:
        if not self.latencies:
            return 0.0
        sorted_lat = sorted(self.latencies)
        idx = int(len(sorted_lat) * 0.95)
        return sorted_lat[min(idx, len(sorted_lat) - 1)]

    def error_rate(self) -> float:
        total = len(self.all_requests)
        if total == 0:
            return 0.0
        errors = sum(1 for r in self.all_requests if r.status_code >= 400)
        return round(errors / total * 100, 2)

    def security_score(self) -> int:
        """Calculate a 0-100 security score."""
        score = 100
        err_rate = self.error_rate()
        if err_rate > 20:
            score -= 20
        elif err_rate > 10:
            score -= 10
        if self.invalid_uploads > 10:
            score -= 10
        elif self.invalid_uploads > 2:
            score -= 5
        if self.suspicious_requests > 5:
            score -= 15
        elif self.suspicious_requests > 0:
            score -= 5
        if self.rate_limit_events > 20:
            score -= 10
        elif self.rate_limit_events > 5:
            score -= 3
        return max(0, min(100, score))


# Global singleton
_store = SecurityStore()


def get_store() -> SecurityStore:
    return _store


# ─── Middleware ────────────────────────────────────────────────────────────────

class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window per-IP rate limiter + request logger."""

    def __init__(self, app, requests_per_minute: int = 120) -> None:
        super().__init__(app)
        self.limit = requests_per_minute
        self.store = _store

    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.perf_counter()
        ip = request.client.host if request.client else "unknown"
        endpoint = request.url.path
        method = request.method

        # Clean old timestamps
        now = time.time()
        ts_deque = self.store.request_timestamps[ip]
        while ts_deque and now - ts_deque[0] > 60:
            ts_deque.popleft()

        # Check rate limit
        if len(ts_deque) >= self.limit:
            rec = RequestRecord(
                timestamp=now,
                endpoint=endpoint,
                method=method,
                status_code=429,
                latency_ms=0,
                ip=ip,
                event_type="RATE_LIMITED",
                severity="WARN",
                message="Rate limit exceeded",
            )
            self.store.record(rec)
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Try again later."},
            )

        # Suspicious pattern detection (basic)
        suspicious = False
        if len(ts_deque) > self.limit * 0.8:
            suspicious = True

        ts_deque.append(now)

        # Process request
        response = await call_next(request)
        latency_ms = (time.perf_counter() - start) * 1000

        event_type = "REQUEST"
        severity = "INFO"
        message = f"{method} {endpoint} {response.status_code}"

        if suspicious:
            event_type = "SUSPICIOUS"
            severity = "WARN"
            message = f"High request rate detected — {message}"
            self.store.suspicious_requests += 1

        if response.status_code == 400 and "ingest" in endpoint:
            event_type = "INVALID_UPLOAD"
            severity = "WARN"
            message = f"Invalid upload rejected — {endpoint}"

        rec = RequestRecord(
            timestamp=now,
            endpoint=endpoint,
            method=method,
            status_code=response.status_code,
            latency_ms=round(latency_ms, 2),
            ip=ip,
            event_type=event_type,
            severity=severity,
            message=message,
        )
        self.store.record(rec)

        return response
