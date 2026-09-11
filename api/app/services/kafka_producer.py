"""Kafka producer service."""
from __future__ import annotations

import json
import logging
from typing import Dict, Any

from confluent_kafka import Producer, KafkaException

from app.utils.config import get_settings

logger = logging.getLogger(__name__)

_producer: Producer | None = None


def _get_producer() -> Producer:
    global _producer
    if _producer is None:
        settings = get_settings()
        conf = {
            "bootstrap.servers": settings.kafka_bootstrap_servers,
            "acks": "all",
            "retries": 3,
            "retry.backoff.ms": 100,
        }
        _producer = Producer(conf)
    return _producer


def _delivery_report(err, msg):
    if err is not None:
        logger.error("Kafka delivery failed: %s", err)
    else:
        logger.debug("Delivered to %s [%d]", msg.topic(), msg.partition())


def publish_row(topic: str, message: Dict[str, Any]) -> None:
    """Publish a single row message to Kafka."""
    producer = _get_producer()
    payload = json.dumps(message, default=str).encode("utf-8")
    producer.produce(topic, value=payload, callback=_delivery_report)
    producer.poll(0)


def flush_producer() -> None:
    """Wait for all outstanding messages to be delivered."""
    producer = _get_producer()
    producer.flush(timeout=30)


def check_kafka_connectivity() -> bool:
    """Return True if Kafka is reachable."""
    try:
        settings = get_settings()
        conf = {"bootstrap.servers": settings.kafka_bootstrap_servers}
        p = Producer(conf)
        # metadata fetch with timeout
        p.list_topics(timeout=3)
        return True
    except Exception as e:
        logger.warning("Kafka connectivity check failed: %s", e)
        return False
