"""Security: File validation and input sanitization."""
from __future__ import annotations

import csv
import io
import re
from typing import Tuple

from fastapi import UploadFile, HTTPException

from app.utils.config import get_settings

ALLOWED_EXTENSIONS = {".csv"}
ALLOWED_MIME_TYPES = {"text/csv", "text/plain", "application/csv", "application/vnd.ms-excel"}
MAX_HEADER_COLUMNS = 200
MAX_FIELD_LENGTH = 10_000


def sanitize_string(value: str) -> str:
    """Remove control characters and null bytes from string values."""
    value = value.replace("\x00", "")
    value = re.sub(r"[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value)
    return value[:MAX_FIELD_LENGTH]


def sanitize_key(key: str) -> str:
    """Make a safe property key for Neo4j (alphanumeric + underscore)."""
    key = sanitize_string(key).strip()
    key = re.sub(r"[^a-zA-Z0-9_]", "_", key)
    if key and key[0].isdigit():
        key = f"col_{key}"
    return key or "unknown"


async def validate_csv_upload(file: UploadFile) -> Tuple[bytes, str]:
    """
    Validate uploaded file is a safe CSV.
    Returns (raw_bytes, detected_filename).
    Raises HTTPException on any validation failure.
    """
    settings = get_settings()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024

    # Extension check
    filename = file.filename or "upload.csv"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Only .csv files are accepted. Got: '{ext or 'no extension'}'",
        )

    # Read with size limit
    raw = await file.read(max_bytes + 1)
    if len(raw) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum allowed size of {settings.max_upload_size_mb}MB",
        )
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    # MIME check — simple header sniff
    content_type = file.content_type or ""
    if content_type and content_type.split(";")[0].strip() not in ALLOWED_MIME_TYPES:
        # Be lenient — some browsers send application/octet-stream for CSV
        # Only block obvious non-text types
        obviously_binary = ["image/", "video/", "audio/", "application/zip",
                            "application/pdf", "application/x-executable"]
        if any(content_type.startswith(b) for b in obviously_binary):
            raise HTTPException(status_code=400, detail="File content type not permitted")

    # Validate parseable CSV
    try:
        text = raw.decode("utf-8", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        headers = reader.fieldnames
        if not headers:
            raise HTTPException(status_code=400, detail="CSV has no headers")
        if len(headers) > MAX_HEADER_COLUMNS:
            raise HTTPException(
                status_code=400,
                detail=f"CSV has too many columns ({len(headers)}). Maximum: {MAX_HEADER_COLUMNS}",
            )
        # Try to read at least first row to confirm it's valid CSV
        first_row = next(reader, None)
        if first_row is None:
            raise HTTPException(status_code=400, detail="CSV has headers but no data rows")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="File could not be parsed as valid CSV")

    return raw, filename
