"""GET /health route."""
from __future__ import annotations

from fastapi import APIRouter

from app.models import HealthResponse
from app.services.kafka_producer import check_kafka_connectivity
from app.services.neo4j_service import check_neo4j_connectivity

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health():
    """Truthful health check — only reports healthy when dependencies are reachable."""
    kafka_ok = check_kafka_connectivity()
    neo4j_ok = check_neo4j_connectivity()

    overall = "ok" if kafka_ok and neo4j_ok else "degraded"

    return HealthResponse(
        status=overall,
        kafka_connected=kafka_ok,
        neo4j_connected=neo4j_ok,
    )
