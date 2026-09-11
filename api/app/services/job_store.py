"""In-memory job status store for ingestion tracking."""
from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Dict, Optional


@dataclass
class JobStatus:
    job_id: str
    dataset_id: str
    filename: str
    status: str = "queued"  # queued | loading | complete | failed
    rows_total: int = 0
    rows_loaded: int = 0
    rows_failed: int = 0
    rows_read: int = 0
    messages_published: int = 0
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    error: Optional[str] = None


class JobStore:
    """Thread-safe in-memory job store."""

    def __init__(self) -> None:
        self._jobs: Dict[str, JobStatus] = {}
        self._lock = threading.Lock()

    def create(self, job: JobStatus) -> None:
        with self._lock:
            self._jobs[job.job_id] = job

    def get(self, job_id: str) -> Optional[JobStatus]:
        with self._lock:
            return self._jobs.get(job_id)

    def update_status(self, job_id: str, **kwargs) -> None:
        with self._lock:
            if job_id in self._jobs:
                for k, v in kwargs.items():
                    setattr(self._jobs[job_id], k, v)

    def increment_loaded(self, job_id: str, count: int = 1) -> None:
        with self._lock:
            if job_id in self._jobs:
                self._jobs[job_id].rows_loaded += count

    def increment_failed(self, job_id: str, count: int = 1) -> None:
        with self._lock:
            if job_id in self._jobs:
                self._jobs[job_id].rows_failed += count


# Global singleton
_job_store = JobStore()


def get_job_store() -> JobStore:
    return _job_store
