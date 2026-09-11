"""Analytics routes — data health, anomalies, relationships, datasets."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models import DataHealthResponse, AnomaliesResponse, RelationshipsResponse
from app.services.analytics_service import (
    calculate_data_health,
    detect_anomalies,
    detect_relationships,
    detect_cross_dataset_relationships,
)
from app.services.neo4j_service import run_query

router = APIRouter(prefix="/analytics")


def _resolve_dataset(dataset_id: str) -> str:
    if dataset_id == "latest":
        result = run_query(
            "MATCH (d:Dataset) RETURN d.id AS id ORDER BY d.uploaded_at DESC LIMIT 1"
        )
        if not result:
            raise HTTPException(status_code=404, detail="No datasets uploaded yet")
        return result[0]["id"]
    return dataset_id


@router.get("/datasets")
async def list_datasets():
    """List all uploaded datasets."""
    result = run_query(
        """
        MATCH (d:Dataset)
        OPTIONAL MATCH (d)-[:HAS_ROW]->(r:Row)
        RETURN d.id AS id, d.filename AS filename, d.uploaded_at AS uploaded_at,
               d.row_count AS row_count, d.job_id AS job_id,
               count(r) AS loaded_count
        ORDER BY d.uploaded_at DESC
        LIMIT 20
        """
    )
    return {"datasets": result}


@router.get("/health/{dataset_id}", response_model=DataHealthResponse)
async def data_health(dataset_id: str):
    """Calculate data health score for a dataset."""
    real_id = _resolve_dataset(dataset_id)
    return calculate_data_health(real_id)


@router.get("/anomalies/{dataset_id}", response_model=AnomaliesResponse)
async def anomalies(dataset_id: str):
    """Detect anomalies in a dataset."""
    real_id = _resolve_dataset(dataset_id)
    return detect_anomalies(real_id)


@router.get("/cross-relationships")
async def cross_relationships():
    """Detect cross-dataset entity relationships across all uploaded datasets."""
    return {"relationships": detect_cross_dataset_relationships()}


@router.get("/relationships/{dataset_id}", response_model=RelationshipsResponse)
async def relationships(dataset_id: str):
    """Detect entity relationships in a dataset."""
    real_id = _resolve_dataset(dataset_id)
    return detect_relationships(real_id)



@router.get("/graph/{dataset_id}")
async def graph_sample(
    dataset_id: str,
    limit: int = Query(default=150, le=500),
):
    """
    Return a sampled graph for visualization.
    Returns Dataset node + sampled Row nodes with properties.
    """
    real_id = _resolve_dataset(dataset_id)

    # Get dataset metadata
    ds_result = run_query(
        "MATCH (d:Dataset {id: $id}) RETURN d",
        {"id": real_id}
    )
    if not ds_result:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Get sampled rows
    rows_result = run_query(
        """
        MATCH (d:Dataset {id: $id})-[:HAS_ROW]->(r:Row)
        RETURN r
        LIMIT $limit
        """,
        {"id": real_id, "limit": limit}
    )

    nodes = []
    links = []

    # Dataset node
    try:
        ds_props = dict(ds_result[0]["d"]) if ds_result[0]["d"] else {}
    except Exception:
        ds_props = {}
    nodes.append({
        "id": f"dataset:{real_id}",
        "label": ds_props.get("filename", real_id[:8]),
        "type": "Dataset",
        "properties": ds_props,
    })

    for row_record in rows_result:
        r = row_record.get("r")
        if not r:
            continue
        try:
            props = dict(r)
        except Exception:
            props = {}
        row_id = f"row:{props.get('dataset_id', '')}:{props.get('row_index', '')}"
        nodes.append({
            "id": row_id,
            "label": f"Row {props.get('row_index', '?')}",
            "type": "Row",
            "properties": props,
        })
        links.append({
            "source": f"dataset:{real_id}",
            "target": row_id,
            "relationship": "HAS_ROW",
        })

    return {
        "dataset_id": real_id,
        "nodes": nodes,
        "links": links,
        "total_nodes": len(nodes),
        "total_links": len(links),
    }
