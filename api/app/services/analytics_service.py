"""Data health engine and anomaly detection service."""
from __future__ import annotations

import statistics
import uuid
from typing import Any, Dict, List, Optional

from app.services.neo4j_service import run_query
from app.models import (
    DataHealthResponse, ColumnHealthInfo,
    AnomaliesResponse, AnomalyItem,
    RelationshipsResponse, RelationshipNode, RelationshipEdge,
)


# ─── Data Health ──────────────────────────────────────────────────────────────

def calculate_data_health(dataset_id: str) -> DataHealthResponse:
    """Calculate a comprehensive data health score for a dataset."""

    # 1. Total rows
    total_result = run_query(
        "MATCH (d:Dataset {id: $id})-[:HAS_ROW]->(r:Row) RETURN count(r) AS total",
        {"id": dataset_id}
    )
    total_rows = total_result[0]["total"] if total_result else 0

    if total_rows == 0:
        return DataHealthResponse(
            dataset_id=dataset_id, score=0, total_rows=0,
            missing_value_count=0, missing_value_pct=0,
            duplicate_risk_count=0, schema_consistency=100,
            anomaly_count=0, columns=[], explanation=["No data loaded yet."]
        )

    # 2. Get schema from first row
    schema_result = run_query(
        "MATCH (d:Dataset {id: $id})-[:HAS_ROW]->(r:Row) WITH r LIMIT 1 RETURN keys(r) AS cols",
        {"id": dataset_id}
    )
    all_cols = schema_result[0]["cols"] if schema_result else []
    data_cols = [c for c in all_cols if c not in ("dataset_id", "row_index", "id")]

    # 3. Per-column analysis
    column_infos: List[ColumnHealthInfo] = []
    total_missing = 0

    for col in data_cols[:20]:  # cap at 20 columns for performance
        col_result = run_query(f"""
            MATCH (d:Dataset {{id: $id}})-[:HAS_ROW]->(r:Row)
            WHERE r.`{col}` IS NULL OR r.`{col}` = ''
            RETURN count(r) AS missing
        """, {"id": dataset_id})
        missing = col_result[0]["missing"] if col_result else 0
        total_missing += missing

        unique_result = run_query(f"""
            MATCH (d:Dataset {{id: $id}})-[:HAS_ROW]->(r:Row)
            WHERE r.`{col}` IS NOT NULL AND r.`{col}` <> ''
            RETURN count(DISTINCT r.`{col}`) AS unique_count
        """, {"id": dataset_id})
        unique_count = unique_result[0]["unique_count"] if unique_result else 0

        sample_result = run_query(f"""
            MATCH (d:Dataset {{id: $id}})-[:HAS_ROW]->(r:Row)
            WHERE r.`{col}` IS NOT NULL AND r.`{col}` <> ''
            RETURN r.`{col}` AS val LIMIT 5
        """, {"id": dataset_id})
        samples = [str(r["val"]) for r in sample_result]

        column_infos.append(ColumnHealthInfo(
            name=col,
            missing_count=missing,
            missing_pct=round(missing / total_rows * 100, 2),
            unique_count=unique_count,
            sample_values=samples,
        ))

    # 4. Duplicate risk — rows where all data cols match
    if len(data_cols) >= 2:
        dup_result = run_query(f"""
            MATCH (d:Dataset {{id: $id}})-[:HAS_ROW]->(r:Row)
            WITH r.`{data_cols[0]}` AS k1, r.`{data_cols[1]}` AS k2, count(*) AS cnt
            WHERE cnt > 1
            RETURN sum(cnt) AS dup_count
        """, {"id": dataset_id})
        dup_count = dup_result[0]["dup_count"] if dup_result else 0
    else:
        dup_count = 0

    # 5. Schema consistency — check if all rows have same key set
    schema_result2 = run_query("""
        MATCH (d:Dataset {id: $id})-[:HAS_ROW]->(r:Row)
        RETURN count(DISTINCT size(keys(r))) AS key_variety LIMIT 1
    """, {"id": dataset_id})
    key_variety = schema_result2[0]["key_variety"] if schema_result2 else 1
    schema_consistency = 100.0 if key_variety <= 1 else max(50.0, 100.0 - (key_variety - 1) * 10)

    # 6. Calculate score
    missing_pct = (total_missing / (total_rows * max(len(data_cols), 1))) * 100
    anomalies = detect_anomalies_raw(dataset_id, total_rows, data_cols)
    anomaly_count = len(anomalies)

    score = 100
    if missing_pct > 20:
        score -= 20
    elif missing_pct > 10:
        score -= 10
    elif missing_pct > 5:
        score -= 5

    if dup_count > 0:
        dup_pct = dup_count / total_rows * 100
        if dup_pct > 10:
            score -= 15
        elif dup_pct > 5:
            score -= 8
        else:
            score -= 3

    if schema_consistency < 100:
        score -= 5

    score -= min(anomaly_count * 3, 20)
    score = max(0, min(100, score))

    # 7. Explanation
    explanation = []
    if missing_pct > 5:
        explanation.append(f"Missing values detected: {missing_pct:.1f}% of cell values are empty")
    if dup_count > 0:
        explanation.append(f"Duplicate risk: {dup_count} rows share key field values")
    if anomaly_count > 0:
        explanation.append(f"{anomaly_count} anomalies detected in distribution patterns")
    if schema_consistency == 100:
        explanation.append("Schema consistency: all rows have consistent structure")
    if score >= 90:
        explanation.append("Overall: data quality is excellent")

    return DataHealthResponse(
        dataset_id=dataset_id,
        score=score,
        total_rows=total_rows,
        missing_value_count=total_missing,
        missing_value_pct=round(missing_pct, 2),
        duplicate_risk_count=int(dup_count or 0),
        schema_consistency=round(schema_consistency, 1),
        anomaly_count=anomaly_count,
        columns=column_infos,
        explanation=explanation or ["Data appears healthy."],
    )


# ─── Anomaly Detection ────────────────────────────────────────────────────────

def detect_anomalies_raw(
    dataset_id: str, total_rows: int, columns: List[str]
) -> List[Dict[str, Any]]:
    """Internal anomaly detection — returns raw dicts."""
    anomalies = []

    # 1. Dominant category detection (z-score on category distribution)
    for col in columns[:10]:
        dist_result = run_query(f"""
            MATCH (d:Dataset {{id: $id}})-[:HAS_ROW]->(r:Row)
            WHERE r.`{col}` IS NOT NULL AND r.`{col}` <> ''
            RETURN r.`{col}` AS val, count(*) AS cnt
            ORDER BY cnt DESC
            LIMIT 20
        """, {"id": dataset_id})

        if len(dist_result) < 2:
            continue

        counts = [r["cnt"] for r in dist_result]
        total_cat = sum(counts)
        if total_cat == 0:
            continue

        mean_count = statistics.mean(counts)
        if len(counts) > 1:
            stdev = statistics.stdev(counts)
        else:
            continue

        if stdev == 0:
            continue

        top = dist_result[0]
        top_val = top["val"]
        top_count = top["cnt"]
        z_score = (top_count - mean_count) / stdev

        if z_score > 2.5 and top_count > total_cat * 0.35:
            pct = round(top_count / total_cat * 100, 1)
            anomalies.append({
                "id": str(uuid.uuid4())[:8],
                "title": f"Dominant category in `{col}`: '{top_val}'",
                "severity": "HIGH" if z_score > 3.5 else "MEDIUM",
                "reason": f"'{top_val}' accounts for {pct}% of all values in `{col}` (z-score: {z_score:.1f})",
                "evidence": f"{top_count} of {total_cat} non-null records have {col}='{top_val}'",
                "affected_count": top_count,
                "column": col,
                "value": str(top_val),
                "cypher": f"MATCH (d:Dataset {{id: '{dataset_id}'}})-[:HAS_ROW]->(r:Row) WHERE r.`{col}` = '{top_val}' RETURN count(r)",
            })

    # 2. Numeric outlier detection (IQR method)
    for col in columns[:10]:
        # Check if column has numeric values
        num_result = run_query(f"""
            MATCH (d:Dataset {{id: $id}})-[:HAS_ROW]->(r:Row)
            WHERE r.`{col}` IS NOT NULL AND r.`{col}` <> ''
            WITH toFloat(r.`{col}`) AS val
            WHERE val IS NOT NULL
            RETURN collect(val) AS vals
        """, {"id": dataset_id})

        if not num_result or not num_result[0].get("vals"):
            continue

        vals = [v for v in num_result[0]["vals"] if v is not None]
        if len(vals) < 10:
            continue

        try:
            sorted_vals = sorted(vals)
            q1 = sorted_vals[len(sorted_vals) // 4]
            q3 = sorted_vals[3 * len(sorted_vals) // 4]
            iqr = q3 - q1
            if iqr == 0:
                continue

            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr
            outliers = [v for v in vals if v < lower or v > upper]

            if outliers and len(outliers) / len(vals) > 0.02:
                anomalies.append({
                    "id": str(uuid.uuid4())[:8],
                    "title": f"Numeric outliers detected in `{col}`",
                    "severity": "MEDIUM",
                    "reason": f"IQR method detected {len(outliers)} outlier values outside [{lower:.2f}, {upper:.2f}]",
                    "evidence": f"Range: {min(vals):.2f} – {max(vals):.2f}. IQR bounds: [{lower:.2f}, {upper:.2f}]. Outliers: {len(outliers)}",
                    "affected_count": len(outliers),
                    "column": col,
                    "value": None,
                    "cypher": f"MATCH (d:Dataset {{id: '{dataset_id}'}})-[:HAS_ROW]->(r:Row) WHERE toFloat(r.`{col}`) > {upper:.2f} OR toFloat(r.`{col}`) < {lower:.2f} RETURN r.row_index, r.`{col}` LIMIT 10",
                })
        except (TypeError, ValueError):
            continue

    # 3. Missing value spike
    for col in columns[:10]:
        miss_result = run_query(f"""
            MATCH (d:Dataset {{id: $id}})-[:HAS_ROW]->(r:Row)
            WHERE r.`{col}` IS NULL OR r.`{col}` = ''
            RETURN count(r) AS missing
        """, {"id": dataset_id})
        missing = miss_result[0]["missing"] if miss_result else 0
        if total_rows > 0:
            miss_pct = missing / total_rows * 100
            if miss_pct > 20:
                anomalies.append({
                    "id": str(uuid.uuid4())[:8],
                    "title": f"High missing rate in `{col}`",
                    "severity": "HIGH" if miss_pct > 40 else "MEDIUM",
                    "reason": f"{miss_pct:.1f}% of values are missing in column `{col}`",
                    "evidence": f"{missing} of {total_rows} rows have no value for `{col}`",
                    "affected_count": missing,
                    "column": col,
                    "value": None,
                    "cypher": f"MATCH (d:Dataset {{id: '{dataset_id}'}})-[:HAS_ROW]->(r:Row) WHERE r.`{col}` IS NULL OR r.`{col}` = '' RETURN count(r)",
                })

    return anomalies


def detect_anomalies(dataset_id: str) -> AnomaliesResponse:
    # Get schema
    schema_result = run_query(
        "MATCH (d:Dataset {id: $id})-[:HAS_ROW]->(r:Row) WITH r LIMIT 1 RETURN keys(r) AS cols",
        {"id": dataset_id}
    )
    all_cols = schema_result[0]["cols"] if schema_result else []
    data_cols = [c for c in all_cols if c not in ("dataset_id", "row_index", "id")]

    total_result = run_query(
        "MATCH (d:Dataset {id: $id})-[:HAS_ROW]->(r:Row) RETURN count(r) AS total",
        {"id": dataset_id}
    )
    total_rows = total_result[0]["total"] if total_result else 0

    raw = detect_anomalies_raw(dataset_id, total_rows, data_cols)
    items = [AnomalyItem(**a) for a in raw]
    return AnomaliesResponse(dataset_id=dataset_id, anomalies=items)


# ─── Relationship Intelligence ────────────────────────────────────────────────

ID_KEYWORDS = ["_id", "id_", "customer", "order", "product", "employee",
               "department", "user", "account", "invoice", "transaction"]


def detect_relationships(dataset_id: str) -> RelationshipsResponse:
    """Detect entity relationships from column naming patterns."""
    schema_result = run_query(
        "MATCH (d:Dataset {id: $id})-[:HAS_ROW]->(r:Row) WITH r LIMIT 1 RETURN keys(r) AS cols",
        {"id": dataset_id}
    )
    all_cols = schema_result[0]["cols"] if schema_result else []
    data_cols = [c for c in all_cols if c not in ("dataset_id", "row_index", "id")]

    # Find ID-like columns
    entity_cols = []
    for col in data_cols:
        col_lower = col.lower()
        if any(kw in col_lower for kw in ID_KEYWORDS):
            entity_cols.append(col)

    if not entity_cols:
        # Fallback — return dataset → rows relationship
        total = run_query(
            "MATCH (d:Dataset {id: $id})-[:HAS_ROW]->(r:Row) RETURN count(r) AS cnt",
            {"id": dataset_id}
        )
        cnt = total[0]["cnt"] if total else 0
        return RelationshipsResponse(
            dataset_id=dataset_id,
            nodes=[
                RelationshipNode(id="dataset", label=dataset_id[:8], type="Dataset", properties={}),
                RelationshipNode(id="rows", label=f"{cnt} Rows", type="Row", properties={}),
            ],
            edges=[RelationshipEdge(source="dataset", target="rows", relationship="HAS_ROW")],
            total_nodes=2,
            total_edges=1,
        )

    # Build graph from sampled rows
    sample_result = run_query(f"""
        MATCH (d:Dataset {{id: $id}})-[:HAS_ROW]->(r:Row)
        RETURN r LIMIT 200
    """, {"id": dataset_id})

    nodes_map: Dict[str, RelationshipNode] = {}
    edges_set = set()
    edges: List[RelationshipEdge] = []

    for row in sample_result:
        r = row.get("r", {})
        try:
            props = dict(r) if r else {}
        except Exception:
            props = {}

        for col in entity_cols:
            val = props.get(col)
            if not val:
                continue
            node_id = f"{col}::{val}"
            col_type = col.replace("_id", "").replace("_ID", "").title().replace("_", "")
            if node_id not in nodes_map:
                nodes_map[node_id] = RelationshipNode(
                    id=node_id, label=str(val), type=col_type, properties={"column": col}
                )

        # Create edges between first two entity columns per row
        if len(entity_cols) >= 2:
            src_col = entity_cols[0]
            for tgt_col in entity_cols[1:]:
                src_val = props.get(src_col)
                tgt_val = props.get(tgt_col)
                if src_val and tgt_val:
                    src_id = f"{src_col}::{src_val}"
                    tgt_id = f"{tgt_col}::{tgt_val}"
                    edge_key = f"{src_id}→{tgt_id}"
                    if edge_key not in edges_set and len(edges) < 300:
                        edges_set.add(edge_key)
                        rel_name = (
                            tgt_col.upper().replace("_ID", "").replace("_", "_")
                        )
                        edges.append(RelationshipEdge(
                            source=src_id, target=tgt_id, relationship=f"HAS_{rel_name}"
                        ))

    # Limit nodes for rendering
    node_list = list(nodes_map.values())[:300]

    return RelationshipsResponse(
        dataset_id=dataset_id,
        nodes=node_list,
        edges=edges[:300],
        total_nodes=len(nodes_map),
        total_edges=len(edges_set),
    )


def detect_cross_dataset_relationships() -> List[Dict[str, Any]]:
    """
    Detect shared identifier columns and cross-dataset relationships across all datasets.
    Factual match basis: e.g. 'Matched on 15 shared customer_id values between Dataset A and Dataset B'
    """
    datasets = run_query(
        "MATCH (d:Dataset) RETURN d.id AS id, d.filename AS filename ORDER BY d.uploaded_at DESC LIMIT 10"
    )
    if len(datasets) < 2:
        return []

    cross_rels = []
    for i in range(len(datasets)):
        for j in range(i + 1, len(datasets)):
            d1 = datasets[i]
            d2 = datasets[j]
            # Find shared keys
            cypher = """
            MATCH (d1:Dataset {id: $id1})-[:HAS_ROW]->(r1:Row), (d2:Dataset {id: $id2})-[:HAS_ROW]->(r2:Row)
            WITH keys(r1) AS k1, keys(r2) AS k2
            LIMIT 1
            RETURN [k IN k1 WHERE k IN k2 AND (k CONTAINS '_id' OR k CONTAINS 'id_' OR k IN ['customer_id', 'order_id', 'user_id', 'product', 'account_id', 'email'])] AS shared_cols
            """
            res = run_query(cypher, {"id1": d1["id"], "id2": d2["id"]})
            shared_cols = res[0].get("shared_cols", []) if res else []
            for col in shared_cols:
                count_query = f"""
                MATCH (d1:Dataset {{id: $id1}})-[:HAS_ROW]->(r1:Row), (d2:Dataset {{id: $id2}})-[:HAS_ROW]->(r2:Row)
                WHERE r1.`{col}` IS NOT NULL AND r1.`{col}` <> '' AND r1.`{col}` = r2.`{col}`
                RETURN count(DISTINCT r1.`{col}`) AS match_count
                """
                cnt_res = run_query(count_query, {"id1": d1["id"], "id2": d2["id"]})
                match_cnt = cnt_res[0]["match_count"] if cnt_res else 0
                if match_cnt > 0:
                    cross_rels.append({
                        "id": f"{d1['id']}_{d2['id']}_{col}",
                        "source_dataset_id": d1["id"],
                        "source_filename": d1.get("filename") or d1["id"][:8],
                        "target_dataset_id": d2["id"],
                        "target_filename": d2.get("filename") or d2["id"][:8],
                        "shared_column": col,
                        "match_count": match_cnt,
                        "basis": f"Matched on {match_cnt} shared {col} value{'s' if match_cnt != 1 else ''}.",
                    })
    return cross_rels

