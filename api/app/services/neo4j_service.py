"""Neo4j driver service."""
from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Any, Dict, Generator, List, Optional

from neo4j import GraphDatabase, Driver
from neo4j.exceptions import ServiceUnavailable

from app.utils.config import get_settings

logger = logging.getLogger(__name__)

_driver: Driver | None = None


def get_driver() -> Driver:
    global _driver
    if _driver is None:
        settings = get_settings()
        _driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
    return _driver


def check_neo4j_connectivity() -> bool:
    """Return True if Neo4j is reachable."""
    try:
        driver = get_driver()
        driver.verify_connectivity()
        return True
    except Exception as e:
        logger.warning("Neo4j connectivity check failed: %s", e)
        return False


def run_query(
    cypher: str,
    parameters: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Execute a Cypher query and return results as list of dicts."""
    driver = get_driver()
    with driver.session() as session:
        result = session.run(cypher, parameters or {})
        return [record.data() for record in result]


def run_query_single(
    cypher: str,
    parameters: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Execute a Cypher query and return first result or None."""
    results = run_query(cypher, parameters)
    return results[0] if results else None


def initialize_constraints() -> None:
    """Create necessary Neo4j constraints and indexes."""
    constraints = [
        "CREATE CONSTRAINT dataset_id_unique IF NOT EXISTS FOR (d:Dataset) REQUIRE d.id IS UNIQUE",
        "CREATE INDEX row_dataset_index IF NOT EXISTS FOR (r:Row) ON (r.dataset_id)",
        "CREATE INDEX row_composite_index IF NOT EXISTS FOR (r:Row) ON (r.dataset_id, r.row_index)",
    ]
    for constraint in constraints:
        try:
            run_query(constraint)
        except Exception as e:
            logger.warning("Constraint creation warning (may already exist): %s", e)
