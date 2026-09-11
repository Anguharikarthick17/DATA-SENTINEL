"""Security and traffic monitoring routes."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from app.models import SecurityStats, SecurityEvent
from app.security.rate_limiter import get_store

router = APIRouter(prefix="/security")


@router.get("/stats", response_model=SecurityStats)
async def security_stats():
    """Return real security and traffic metrics."""
    store = get_store()

    events = []
    for rec in store.recent_events(50):
        events.append(SecurityEvent(
            timestamp=datetime.fromtimestamp(rec.timestamp, tz=timezone.utc).isoformat(),
            endpoint=rec.endpoint,
            event_type=rec.event_type,
            severity=rec.severity,
            status_code=rec.status_code,
            message=rec.message,
            ip=None,  # Never expose client IPs in API response
        ))

    return SecurityStats(
        security_score=store.security_score(),
        requests_per_minute=store.requests_per_minute(),
        blocked_requests=store.blocked_count,
        rate_limit_events=store.rate_limit_events,
        invalid_uploads=store.invalid_uploads,
        suspicious_requests=store.suspicious_requests,
        api_errors=store.api_errors,
        avg_latency_ms=round(store.avg_latency(), 2),
        p95_latency_ms=round(store.p95_latency(), 2),
        error_rate=store.error_rate(),
        events=events,
    )


@router.get("/events")
async def security_events(limit: int = 20):
    """Return recent security events."""
    store = get_store()
    events = []
    for rec in store.recent_events(limit):
        events.append({
            "timestamp": datetime.fromtimestamp(rec.timestamp, tz=timezone.utc).isoformat(),
            "endpoint": rec.endpoint,
            "method": rec.method,
            "event_type": rec.event_type,
            "severity": rec.severity,
            "status_code": rec.status_code,
            "latency_ms": rec.latency_ms,
            "message": rec.message,
        })
    return {"events": events, "total": len(store.all_requests)}
