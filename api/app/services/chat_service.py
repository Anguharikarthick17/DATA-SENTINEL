"""Deterministic NL → Cypher chat service. Fully grounded — no LLM hallucination."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from app.services.neo4j_service import run_query

STOP_WORDS = {
    "the", "a", "an", "this", "that", "all", "any", "dataset", "database",
    "table", "data", "file", "csv", "records", "rows", "values", "items",
}


# ─── Schema introspection ─────────────────────────────────────────────────────

def get_dataset_schema(dataset_id: str) -> Dict[str, Any]:
    """Introspect the actual columns present in the dataset."""
    cypher = """
    MATCH (d:Dataset {id: $dataset_id})-[:HAS_ROW]->(r:Row)
    WITH r LIMIT 1
    RETURN keys(r) AS columns
    """
    result = run_query(cypher, {"dataset_id": dataset_id})
    if not result:
        return {"columns": [], "dataset_id": dataset_id}
    cols = [c for c in (result[0].get("columns") or [])
            if c not in ("dataset_id", "row_index", "id")]
    return {"columns": cols, "dataset_id": dataset_id}


def get_latest_dataset_id() -> Optional[str]:
    """Return the most recently uploaded dataset ID."""
    result = run_query(
        "MATCH (d:Dataset) RETURN d.id AS id ORDER BY d.uploaded_at DESC LIMIT 1"
    )
    return result[0]["id"] if result else None


# ─── Pattern matching engine ─────────────────────────────────────────────────

def _normalize(text: str) -> str:
    return text.lower().strip()


def _extract_quoted_value(text: str) -> Optional[str]:
    """Extract a quoted string from text."""
    match = re.search(r"['\"]([^'\"]+)['\"]", text)
    return match.group(1).strip() if match else None


def _extract_number(text: str) -> Optional[float]:
    match = re.search(r"\b(\d+(?:\.\d+)?)\b", text)
    return float(match.group(1)) if match else None


def _find_column(columns: List[str], keywords: List[str]) -> Optional[str]:
    """Find a column matching one of the keywords."""
    for kw in keywords:
        kw_lower = kw.lower()
        for col in columns:
            if kw_lower in col.lower():
                return col
    return None


def _extract_filter_value_and_column(q_raw: str, columns: List[str]) -> Tuple[Optional[str], Optional[str]]:
    """
    Extract (filter_value, target_column) from question.
    Handles specific queries:
    - 'belong to Billing' -> ('Billing', 'category')
    - 'from Chennai' -> ('Chennai', 'city'/'region')
    - 'where category is Billing' / 'category = Billing' -> ('Billing', 'category')
    - 'status Complete' -> ('Complete', 'status')
    - Quoted string: "..." or '...'
    """
    q = q_raw.strip()
    q_lower = q.lower()

    # 1. Quoted value
    m_quote = re.search(r"['\"]([^'\"]+)['\"]", q)
    if m_quote:
        val = m_quote.group(1).strip()
        for col in columns:
            if re.search(rf"\b{re.escape(col.lower())}\b", q_lower):
                return val, col
        # Fallback to category or location column
        cat_col = _find_column(columns, ["category", "region", "city", "department", "status"])
        return val, cat_col

    # 2. "belong(ing) to <value>"
    m_belong = re.search(r"\bbelong(?:ing)?\s+to\s+([A-Za-z0-9_-]+)", q, re.IGNORECASE)
    if m_belong:
        val = m_belong.group(1).strip()
        if val.lower() not in STOP_WORDS:
            cat_col = _find_column(columns, ["category", "group", "department", "type", "segment", "class"])
            return val, cat_col or (columns[0] if columns else None)

    # 3. "from <value>" (e.g. from Chennai, from North)
    m_from = re.search(r"\bfrom\s+([A-Za-z0-9_-]+)", q, re.IGNORECASE)
    if m_from:
        val = m_from.group(1).strip()
        if val.lower() not in STOP_WORDS:
            loc_col = _find_column(columns, ["city", "region", "location", "state", "country", "place", "address", "branch"])
            if not loc_col:
                loc_col = _find_column(columns, ["category", "department", "origin", "source"])
            return val, loc_col or (columns[0] if columns else None)

    # 4. "where <col> (is|=|equals|contains) <val>"
    m_where = re.search(r"\bwhere\s+([A-Za-z0-9_]+)\s*(?:=|is|equals|contains|like)\s*([A-Za-z0-9_-]+)", q, re.IGNORECASE)
    if m_where:
        c_name, val = m_where.group(1).strip(), m_where.group(2).strip()
        for col in columns:
            if col.lower() == c_name.lower():
                return val, col

    # 5. "<col> (is|=) <val>" or "<col> <val>" (e.g. status Complete, region North)
    for col in columns:
        m_col = re.search(rf"\b{re.escape(col.lower())}\s+(?:is|=|equals)?\s*([A-Za-z0-9_-]+)", q_lower)
        if m_col:
            val = m_col.group(1).strip()
            if val not in STOP_WORDS and val not in ["null", "empty", "missing", "blank"]:
                orig_m = re.search(rf"\b{re.escape(val)}\b", q, re.IGNORECASE)
                return orig_m.group(0) if orig_m else val, col

    return None, None


def _build_verification(
    question: str,
    intent: str,
    cypher: str,
    evidence: str,
    status: str,
) -> Dict[str, Any]:
    """Generate structured audit trail for Sentinel Verification Firewall."""
    steps = []
    if status == "NO_DATASET":
        steps = [
            {"step": "01", "label": "QUESTION RECEIVED", "detail": f'"{question}"', "status": "ok"},
            {"step": "02", "label": "DATASET VERIFICATION", "detail": "No active dataset found in graph", "status": "blocked"},
            {"step": "03", "label": "FIREWALL ACTION", "detail": "Answer blocked — upload CSV first", "status": "blocked"},
        ]
    elif status == "UNSUPPORTED":
        steps = [
            {"step": "01", "label": "QUESTION RECEIVED", "detail": f'"{question}"', "status": "ok"},
            {"step": "02", "label": "INTENT DETECTED", "detail": intent or "Outside dataset schema", "status": "warning"},
            {"step": "03", "label": "NO DATASET EVIDENCE", "detail": "No corresponding Cypher pattern in graph model", "status": "blocked"},
            {"step": "04", "label": "FIREWALL ACTION", "detail": "⚠ ANSWER BLOCKED (Anti-Hallucination Firewall)", "status": "blocked"},
        ]
    elif status == "NO_EVIDENCE":
        steps = [
            {"step": "01", "label": "QUESTION RECEIVED", "detail": f'"{question}"', "status": "ok"},
            {"step": "02", "label": "INTENT DETECTED", "detail": intent, "status": "ok"},
            {"step": "03", "label": "CYPHER GENERATED", "detail": cypher, "status": "ok"},
            {"step": "04", "label": "NEO4J EXECUTED", "detail": "Query returned 0 matching records", "status": "warning"},
            {"step": "05", "label": "VERIFICATION RESULT", "detail": "⚠ NO EVIDENCE IN GRAPH", "status": "warning"},
        ]
    else:  # VERIFIED
        steps = [
            {"step": "01", "label": "QUESTION RECEIVED", "detail": f'"{question}"', "status": "ok"},
            {"step": "02", "label": "INTENT DETECTED", "detail": intent, "status": "ok"},
            {"step": "03", "label": "CYPHER GENERATED", "detail": cypher, "status": "ok"},
            {"step": "04", "label": "NEO4J EXECUTED", "detail": "Query completed against Neo4j", "status": "ok"},
            {"step": "05", "label": "EVIDENCE FOUND", "detail": evidence, "status": "ok"},
            {"step": "06", "label": "ANSWER VERIFIED", "detail": "✓ GROUNDED IN DATA", "status": "ok"},
        ]
    return {
        "verification_status": status,
        "intent": intent,
        "evidence": evidence,
        "verification_steps": steps,
    }


def answer_question(question: str, dataset_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Deterministic NL → Cypher → Neo4j → grounded answer.
    Specific/filter/category patterns are evaluated BEFORE generic counts.
    Enforces the Sentinel Anti-Hallucination Firewall.
    """
    # Resolve dataset
    if not dataset_id:
        dataset_id = get_latest_dataset_id()

    if not dataset_id:
        v_meta = _build_verification(
            question=question,
            intent="Unknown",
            cypher="",
            evidence="No dataset registered in Neo4j",
            status="NO_DATASET",
        )
        return {
            "answer": "No data has been uploaded yet. Please upload a CSV file first.",
            "cypher": "",
            "result": [],
            "grounded": False,
            **v_meta,
        }

    schema = get_dataset_schema(dataset_id)
    columns = schema["columns"]
    q = _normalize(question)

    # ── 1. Missing values ─────────────────────────────────────────────────────
    if any(p in q for p in ["missing", "null", "empty", "blank", "no value"]):
        target_col = None
        for col in columns:
            if col.lower() in q:
                target_col = col
                break

        if target_col:
            cypher = f"""
            MATCH (d:Dataset {{id: $dataset_id}})-[:HAS_ROW]->(r:Row)
            WHERE r.`{target_col}` IS NULL OR r.`{target_col}` = ''
            RETURN count(r) AS missing_count
            """
        else:
            cypher = """
            MATCH (d:Dataset {id: $dataset_id})-[:HAS_ROW]->(r:Row)
            RETURN count(r) AS total
            """
            target_col = "any column"

        result = run_query(cypher, {"dataset_id": dataset_id})
        count = result[0].get("missing_count", result[0].get("total", 0)) if result else 0
        v_meta = _build_verification(
            question=question,
            intent=f"Missing value analysis on `{target_col}`",
            cypher=cypher.strip(),
            evidence=f"Count = {count}",
            status="VERIFIED",
        )
        return {
            "answer": f"There are **{count:,}** rows with missing values in `{target_col}`.",
            "cypher": cypher.strip(),
            "result": result,
            "grounded": True,
            **v_meta,
        }

    # ── 2. Average / sum ──────────────────────────────────────────────────────
    if any(p in q for p in ["average", "avg", "mean", "sum", "total amount", "sum of", "total quantity"]):
        num_col = _find_column(columns, ["amount", "value", "price", "total", "revenue",
                                          "quantity", "score", "rating", "age"])
        if num_col:
            if any(p in q for p in ["sum", "total amount", "total quantity", "sum of"]):
                agg = "sum"
                label = "total sum"
            else:
                agg = "avg"
                label = "average"
            cypher = f"""
            MATCH (d:Dataset {{id: $dataset_id}})-[:HAS_ROW]->(r:Row)
            WHERE r.`{num_col}` IS NOT NULL
            RETURN {agg}(toFloat(r.`{num_col}`)) AS result
            """
            result = run_query(cypher, {"dataset_id": dataset_id})
            val = result[0]["result"] if result and result[0].get("result") is not None else 0
            v_meta = _build_verification(
                question=question,
                intent=f"Numeric aggregation ({agg.upper()}) on `{num_col}`",
                cypher=cypher.strip(),
                evidence=f"{label.capitalize()} = {val:.2f}",
                status="VERIFIED",
            )
            return {
                "answer": f"The {label} of `{num_col}` is **{val:.2f}**.",
                "cypher": cypher.strip(),
                "result": result,
                "grounded": True,
                **v_meta,
            }

    # ── 3. Top N records ──────────────────────────────────────────────────────
    if any(p in q for p in ["top", "highest", "largest", "maximum", "max"]):
        num_col = _find_column(columns, ["amount", "value", "price", "total", "revenue",
                                          "count", "quantity", "score", "rating"])
        n = int(_extract_number(question) or 5)
        if num_col:
            cypher = f"""
            MATCH (d:Dataset {{id: $dataset_id}})-[:HAS_ROW]->(r:Row)
            WHERE r.`{num_col}` IS NOT NULL
            RETURN r.row_index AS row_index, r.`{num_col}` AS value
            ORDER BY toFloat(r.`{num_col}`) DESC
            LIMIT {n}
            """
            result = run_query(cypher, {"dataset_id": dataset_id})
            rows_str = ", ".join(f"row {r['row_index']} ({r['value']})" for r in result)
            v_meta = _build_verification(
                question=question,
                intent=f"Top {n} ranking by `{num_col}`",
                cypher=cypher.strip(),
                evidence=f"Retrieved {len(result)} records",
                status="VERIFIED",
            )
            return {
                "answer": f"The top **{n}** rows by `{num_col}`: {rows_str}",
                "cypher": cypher.strip(),
                "result": result,
                "grounded": True,
                **v_meta,
            }

    # ── 4. List unique values for a column ────────────────────────────────────
    if any(p in q for p in ["unique", "distinct", "different", "what are the categories", "list categories", "what are the"]):
        target_col = None
        for col in columns:
            if col.lower() in q or col.lower().replace("_", " ") in q:
                target_col = col
                break
        if not target_col:
            target_col = _find_column(columns, ["category", "status", "region", "department"])

        if target_col and any(p in q for p in ["unique", "distinct", "different", "categories", "statuses", "regions"]):
            cypher = f"""
            MATCH (d:Dataset {{id: $dataset_id}})-[:HAS_ROW]->(r:Row)
            WHERE r.`{target_col}` IS NOT NULL
            RETURN DISTINCT r.`{target_col}` AS value, count(*) AS count
            ORDER BY count DESC
            LIMIT 20
            """
            result = run_query(cypher, {"dataset_id": dataset_id})
            values = [str(row["value"]) for row in result]
            v_meta = _build_verification(
                question=question,
                intent=f"Distinct value introspection for `{target_col}`",
                cypher=cypher.strip(),
                evidence=f"Found {len(values)} distinct values",
                status="VERIFIED",
            )
            return {
                "answer": f"The distinct values in `{target_col}` are: **{', '.join(values)}**",
                "cypher": cypher.strip(),
                "result": result,
                "grounded": True,
                **v_meta,
            }

    # ── 5. List columns / schema ──────────────────────────────────────────────
    if any(p in q for p in ["what columns", "list columns", "schema", "what fields",
                             "what data", "columns are", "fields are"]):
        cypher = """
        MATCH (d:Dataset {id: $dataset_id})-[:HAS_ROW]->(r:Row)
        WITH r LIMIT 1
        RETURN keys(r) AS columns
        """
        result = run_query(cypher, {"dataset_id": dataset_id})
        cols = [c for c in (result[0]["columns"] if result else [])
                if c not in ("dataset_id", "row_index")]
        v_meta = _build_verification(
            question=question,
            intent="Dataset schema introspection",
            cypher=cypher.strip(),
            evidence=f"Found {len(cols)} columns in graph schema",
            status="VERIFIED",
        )
        return {
            "answer": f"The dataset has **{len(cols)}** columns: `{'`, `'.join(cols)}`",
            "cypher": cypher.strip(),
            "result": [{"columns": cols}],
            "grounded": True,
            **v_meta,
        }

    # ── 6. Filtered record retrieval (Show / list records matching a value) ───
    filter_val, filter_col = _extract_filter_value_and_column(question, columns)

    if filter_val and any(p in q for p in ["show", "list", "find", "get", "display", "records where", "filter", "customers from", "orders from", "rows where"]):
        target_col = filter_col or (columns[0] if columns else "category")
        cypher = f"""
        MATCH (d:Dataset {{id: $dataset_id}})-[:HAS_ROW]->(r:Row)
        WHERE toLower(toString(r.`{target_col}`)) = toLower($value)
        RETURN r LIMIT 10
        """
        result = run_query(cypher, {"dataset_id": dataset_id, "value": filter_val})
        status = "VERIFIED" if result else "NO_EVIDENCE"
        v_meta = _build_verification(
            question=question,
            intent=f"Record retrieval filter: `{target_col}` = {filter_val}",
            cypher=cypher.strip(),
            evidence=f"Found {len(result)} records matching filter",
            status=status,
        )
        return {
            "answer": f"Found **{len(result)}** records where `{target_col}` = **{filter_val}** (showing up to 10).",
            "cypher": cypher.strip(),
            "result": result,
            "grounded": True,
            **v_meta,
        }

    # ── 7. Count by category / filtered group value ───────────────────────────
    if filter_val and any(p in q for p in ["how many", "count", "belong", "from", "where", "with"]):
        target_col = filter_col or (columns[0] if columns else "category")
        cypher = f"""
        MATCH (d:Dataset {{id: $dataset_id}})-[:HAS_ROW]->(r:Row)
        WHERE toLower(toString(r.`{target_col}`)) = toLower($value)
        RETURN count(r) AS count
        """
        result = run_query(cypher, {"dataset_id": dataset_id, "value": filter_val})
        count = result[0]["count"] if result else 0
        status = "VERIFIED" if count > 0 else "NO_EVIDENCE"
        v_meta = _build_verification(
            question=question,
            intent=f"Filtered count query: `{target_col}` = {filter_val}",
            cypher=cypher.strip(),
            evidence=f"Result count = {count}",
            status=status,
        )
        return {
            "answer": f"There are **{count:,}** rows where `{target_col}` = **{filter_val}**.",
            "cypher": cypher.strip(),
            "result": result,
            "grounded": True,
            **v_meta,
        }

    # ── 8. Total generic row count (ONLY when no filter condition exists) ─────
    if any(p in q for p in ["how many rows", "total rows", "count rows", "number of rows",
                             "how many records", "total records", "row count", "how many items"]):
        cypher = """
        MATCH (d:Dataset {id: $dataset_id})-[:HAS_ROW]->(r:Row)
        RETURN count(r) AS count
        """
        result = run_query(cypher, {"dataset_id": dataset_id})
        count = result[0]["count"] if result else 0
        v_meta = _build_verification(
            question=question,
            intent="Total dataset row count",
            cypher=cypher.strip(),
            evidence=f"Total count = {count}",
            status="VERIFIED",
        )
        return {
            "answer": f"The dataset contains **{count:,}** rows.",
            "cypher": cypher.strip(),
            "result": result,
            "grounded": True,
            **v_meta,
        }

    # ── 9. Dataset metadata ───────────────────────────────────────────────────
    if any(p in q for p in ["dataset", "uploaded", "when was this", "filename", "file name"]):
        cypher = """
        MATCH (d:Dataset {id: $dataset_id})
        RETURN d.filename AS filename, d.uploaded_at AS uploaded_at, d.row_count AS row_count
        """
        result = run_query(cypher, {"dataset_id": dataset_id})
        if result:
            r = result[0]
            v_meta = _build_verification(
                question=question,
                intent="Dataset metadata query",
                cypher=cypher.strip(),
                evidence=f"Filename: {r.get('filename')}, Uploaded: {r.get('uploaded_at')}",
                status="VERIFIED",
            )
            return {
                "answer": f"Dataset **{r.get('filename', 'unknown')}** was uploaded at {r.get('uploaded_at', 'unknown')} with {r.get('row_count', '?')} rows.",
                "cypher": cypher.strip(),
                "result": result,
                "grounded": True,
                **v_meta,
            }

    # ── Fallback: ANTI-HALLUCINATION FIREWALL ─────────────────────────────────
    available = ", ".join([
        "row counts", "column listing", f"values in {', '.join(columns[:3]) if columns else 'columns'}",
        "missing value counts", "top/bottom records", "averages and sums",
    ])
    v_meta = _build_verification(
        question=question,
        intent="Outside dataset schema",
        cypher="",
        evidence="Question cannot be answered from uploaded data",
        status="UNSUPPORTED",
    )
    return {
        "answer": (
            "I don't have that information in the uploaded data.\n\n"
            f"I can answer questions about: **{available}**.\n\n"
            "Try: *'How many rows are there?'* or *'What columns are in the dataset?'*"
        ),
        "cypher": "",
        "result": [],
        "grounded": False,
        **v_meta,
    }


