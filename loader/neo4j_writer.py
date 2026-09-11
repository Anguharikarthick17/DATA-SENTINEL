"""Neo4j writer for the loader service.

Uses MERGE for idempotency — uploading the same CSV twice NEVER duplicates rows.
Stable key: dataset_id + row_index
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict

from neo4j import GraphDatabase, Driver

logger = logging.getLogger(__name__)

_driver: Driver | None = None


def get_driver() -> Driver:
    global _driver
    if _driver is None:
        uri = os.environ.get("NEO4J_URI", "bolt://neo4j:7687")
        user = os.environ.get("NEO4J_USER", "neo4j")
        password = os.environ.get("NEO4J_PASSWORD")
        if not password:
            raise RuntimeError("NEO4J_PASSWORD environment variable is required but not set")
        _driver = GraphDatabase.driver(uri, auth=(user, password))
    return _driver


def write_row(job_id: str, dataset_id: str, row_index: int, data: Dict[str, Any]) -> None:
    """
    Write a single CSV row to Neo4j using MERGE for idempotency.

    Graph model:
      (:Dataset {id: dataset_id})
        -[:HAS_ROW]->
      (:Row {dataset_id: dataset_id, row_index: row_index, ...columns})

    The MERGE key is (dataset_id, row_index) which is stable and unique.
    Re-uploading the same CSV produces no duplicate Row nodes.
    """
    driver = get_driver()

    # Use SET r += $props to bulk-set all dynamic column properties.
    # This is safe and idiomatic in Neo4j — merges the property map onto the node.
    cypher = """
    MATCH (d:Dataset {id: $dataset_id})
    MERGE (r:Row {dataset_id: $dataset_id, row_index: $row_index})
    SET r += $props
    MERGE (d)-[:HAS_ROW]->(r)
    """

    with driver.session() as session:
        session.run(
            cypher,
            dataset_id=dataset_id,
            row_index=row_index,
            props=data,
        )


def record_failed_row(dataset_id: str) -> None:
    """
    Increment rows_failed count on Dataset node in Neo4j.
    Enables shared failure tracking between Loader and API.
    """
    if not dataset_id:
        return
    driver = get_driver()
    cypher = """
    MATCH (d:Dataset {id: $dataset_id})
    SET d.rows_failed = coalesce(d.rows_failed, 0) + 1
    """
    try:
        with driver.session() as session:
            session.run(cypher, dataset_id=dataset_id)
    except Exception as e:
        logger.error("Failed to record row failure for dataset %s: %s", dataset_id, e)

