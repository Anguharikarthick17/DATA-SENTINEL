"""Pydantic models for Data Sentinel API."""
from __future__ import annotations

from typing import Any, List, Optional
from pydantic import BaseModel, Field


# ─── Ingest ───────────────────────────────────────────────────────────────────

class IngestResponse(BaseModel):
    job_id: str
    rows_received: int
    status: str = "queued"


class StatusResponse(BaseModel):
    job_id: str
    status: str  # queued | loading | complete | failed
    rows_total: int
    rows_loaded: int
    rows_failed: int
    filename: Optional[str] = None
    dataset_id: Optional[str] = None
    # Live telemetry extensions (optional with defaults for backwards compatibility)
    rows_read: Optional[int] = None
    messages_published: Optional[int] = None
    duration_ms: Optional[float] = None
    throughput_rows_sec: Optional[float] = None


# ─── Health ───────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    kafka_connected: bool
    neo4j_connected: bool


# ─── Chat ─────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)
    dataset_id: Optional[str] = None


class VerificationStep(BaseModel):
    step: str
    label: str
    detail: str
    status: str = "ok"  # ok | warning | blocked


class ChatResponse(BaseModel):
    answer: str
    cypher: str
    result: List[Any]
    grounded: bool
    # Sentinel Verification Firewall extensions
    verification_status: Optional[str] = "VERIFIED"  # VERIFIED | NO_EVIDENCE | UNSUPPORTED | NO_DATASET
    intent: Optional[str] = None
    evidence: Optional[str] = None
    verification_steps: Optional[List[VerificationStep]] = None


# ─── Analytics ────────────────────────────────────────────────────────────────

class ColumnHealthInfo(BaseModel):
    name: str
    missing_count: int
    missing_pct: float
    unique_count: int
    sample_values: List[str]


class DataHealthResponse(BaseModel):
    dataset_id: str
    score: int
    total_rows: int
    missing_value_count: int
    missing_value_pct: float
    duplicate_risk_count: int
    schema_consistency: float
    anomaly_count: int
    columns: List[ColumnHealthInfo]
    explanation: List[str]


class AnomalyItem(BaseModel):
    id: str
    title: str
    severity: str  # CRITICAL | HIGH | MEDIUM | LOW
    reason: str
    evidence: str
    affected_count: int
    column: Optional[str] = None
    value: Optional[str] = None
    cypher: Optional[str] = None


class AnomaliesResponse(BaseModel):
    dataset_id: str
    anomalies: List[AnomalyItem]


class RelationshipNode(BaseModel):
    id: str
    label: str
    type: str
    properties: dict


class RelationshipEdge(BaseModel):
    source: str
    target: str
    relationship: str


class RelationshipsResponse(BaseModel):
    dataset_id: str
    nodes: List[RelationshipNode]
    edges: List[RelationshipEdge]
    total_nodes: int
    total_edges: int


# ─── Security ─────────────────────────────────────────────────────────────────

class SecurityEvent(BaseModel):
    timestamp: str
    endpoint: str
    event_type: str
    severity: str  # INFO | WARN | CRITICAL
    status_code: int
    message: str
    ip: Optional[str] = None


class SecurityStats(BaseModel):
    security_score: int
    requests_per_minute: float
    blocked_requests: int
    rate_limit_events: int
    invalid_uploads: int
    suspicious_requests: int
    api_errors: int
    avg_latency_ms: float
    p95_latency_ms: float
    error_rate: float
    events: List[SecurityEvent]
