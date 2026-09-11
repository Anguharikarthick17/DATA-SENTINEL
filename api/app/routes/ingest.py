"""POST /ingest and GET /status routes."""
from __future__ import annotations

import csv
import hashlib
import io
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.models import IngestResponse, StatusResponse
from app.security.validators import validate_csv_upload, sanitize_key, sanitize_string
from app.services.job_store import JobStatus, get_job_store
from app.services.kafka_producer import publish_row, flush_producer
from app.services.neo4j_service import run_query
from app.utils.config import get_settings

router = APIRouter()


@router.post("/ingest", response_model=IngestResponse)
async def ingest_csv(file: UploadFile = File(...)):
    """
    Accept a CSV file, validate it, publish each row to Kafka.
    NEVER writes to Neo4j directly — Kafka is the only path.
    """
    settings = get_settings()

    # Validate
    raw, filename = await validate_csv_upload(file)

    # Parse CSV
    text = raw.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)

    if len(rows) == 0:
        raise HTTPException(status_code=400, detail="CSV has headers but no data rows")

    # Create job and deterministic dataset identity from raw file content
    job_id = str(uuid.uuid4())
    dataset_id = hashlib.sha256(raw).hexdigest()[:16]
    store = get_job_store()
    now_ts = time.time()

    job = JobStatus(
        job_id=job_id,
        dataset_id=dataset_id,
        filename=filename,
        status="queued",
        rows_total=len(rows),
        rows_loaded=0,
        rows_failed=0,
        rows_read=len(rows),
        messages_published=len(rows),
        started_at=now_ts,
    )
    store.create(job)

    # Create Dataset node in Neo4j (direct — metadata only, not row data)
    # Initialize rows_failed = 0 on create
    try:
        run_query(
            """
            MERGE (d:Dataset {id: $id})
            ON CREATE SET d.rows_failed = 0
            SET d.filename = $filename,
                d.uploaded_at = $uploaded_at,
                d.row_count = $row_count,
                d.job_id = $job_id,
                d.rows_read = $rows_read,
                d.messages_published = $messages_published,
                d.started_at = $started_at,
                d.rows_failed = coalesce(d.rows_failed, 0)
            """,
            {
                "id": dataset_id,
                "filename": filename,
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
                "row_count": len(rows),
                "job_id": job_id,
                "rows_read": len(rows),
                "messages_published": len(rows),
                "started_at": now_ts,
            }
        )
    except Exception as e:
        store.update_status(job_id, status="failed", error=str(e))
        raise HTTPException(status_code=503, detail="Neo4j unavailable — cannot register dataset")

    # Publish rows to Kafka
    store.update_status(job_id, status="loading")
    try:
        for i, row in enumerate(rows):
            # Sanitize all keys and values
            clean_row = {
                sanitize_key(k): sanitize_string(str(v)) if v is not None else ""
                for k, v in row.items()
            }
            message = {
                "job_id": job_id,
                "dataset_id": dataset_id,
                "row_index": i,
                "data": clean_row,
            }
            publish_row(settings.kafka_topic, message)

        # Flush all messages
        flush_producer()

    except Exception as e:
        store.update_status(job_id, status="failed", error=str(e))
        raise HTTPException(status_code=503, detail="Kafka unavailable — cannot publish rows")

    return IngestResponse(
        job_id=job_id,
        rows_received=len(rows),
        status="queued",
    )


@router.get("/status", response_model=StatusResponse)
async def get_status(job_id: str):
    """Return real ingestion progress and live telemetry for a job."""
    store = get_job_store()
    job = store.get(job_id)

    if not job:
        # Try to query Neo4j for job metadata as fallback
        result = run_query(
            "MATCH (d:Dataset {job_id: $job_id}) RETURN d.id AS dataset_id, coalesce(d.row_count, 0) AS row_count, d.filename AS filename, coalesce(d.rows_failed, 0) AS rows_failed, coalesce(d.rows_read, d.row_count) AS rows_read, coalesce(d.messages_published, d.row_count) AS messages_published, d.started_at AS started_at",
            {"job_id": job_id}
        )
        if result:
            r = result[0]
            loaded_result = run_query(
                "MATCH (d:Dataset {id: $id})-[:HAS_ROW]->(r:Row) RETURN count(r) AS cnt",
                {"id": r["dataset_id"]}
            )
            loaded = loaded_result[0]["cnt"] if loaded_result else 0
            total = r.get("row_count") or 0
            failed = r.get("rows_failed") or 0
            started = r.get("started_at")
            dur = (time.time() - started) * 1000 if started else None
            tput = round(loaded / (dur / 1000.0), 1) if dur and dur > 0 and loaded > 0 else None
            if (loaded + failed) >= total and total > 0:
                status = "failed" if loaded == 0 and failed > 0 else "complete"
            else:
                status = "loading"
            return StatusResponse(
                job_id=job_id,
                status=status,
                rows_total=total,
                rows_loaded=loaded,
                rows_failed=failed,
                filename=r.get("filename"),
                dataset_id=r["dataset_id"],
                rows_read=r.get("rows_read", total),
                messages_published=r.get("messages_published", total),
                duration_ms=round(dur, 1) if dur else None,
                throughput_rows_sec=tput,
            )
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

    # Check actual loaded and failed rows from Neo4j for accuracy
    now = time.time()
    try:
        ds_meta = run_query(
            "MATCH (d:Dataset {id: $id}) RETURN coalesce(d.rows_failed, 0) AS failed, coalesce(d.row_count, 0) AS total",
            {"id": job.dataset_id}
        )
        loaded_result = run_query(
            "MATCH (d:Dataset {id: $id})-[:HAS_ROW]->(r:Row) RETURN count(r) AS cnt",
            {"id": job.dataset_id}
        )
        actual_loaded = loaded_result[0]["cnt"] if loaded_result else 0
        actual_failed = ds_meta[0]["failed"] if ds_meta else job.rows_failed

        # Calculate duration and throughput
        if (actual_loaded + actual_failed) >= job.rows_total and job.rows_total > 0:
            final_status = "failed" if actual_loaded == 0 and actual_failed > 0 else "complete"
            if not job.completed_at:
                store.update_status(job_id, completed_at=now)
                job = store.get(job_id)
            store.update_status(job_id, status=final_status)
        else:
            store.update_status(job_id, rows_loaded=actual_loaded, rows_failed=actual_failed)

        job = store.get(job_id)

    except Exception:
        actual_loaded = job.rows_loaded
        actual_failed = job.rows_failed

    # Derive real telemetry durations
    if job.completed_at and job.started_at:
        duration_ms = max(1.0, (job.completed_at - job.started_at) * 1000)
    elif job.started_at:
        duration_ms = max(1.0, (now - job.started_at) * 1000)
    else:
        duration_ms = None

    throughput = round(actual_loaded / (duration_ms / 1000.0), 1) if duration_ms and duration_ms > 0 and actual_loaded > 0 else None

    return StatusResponse(
        job_id=job.job_id,
        status=job.status,
        rows_total=job.rows_total,
        rows_loaded=actual_loaded,
        rows_failed=actual_failed,
        filename=job.filename,
        dataset_id=job.dataset_id,
        rows_read=job.rows_read or job.rows_total,
        messages_published=job.messages_published or job.rows_total,
        duration_ms=round(duration_ms, 1) if duration_ms else None,
        throughput_rows_sec=throughput,
    )


