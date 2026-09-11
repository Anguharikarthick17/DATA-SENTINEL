"""Kafka consumer — reads csv-rows topic, writes to Neo4j via MERGE."""
from __future__ import annotations

import json
import logging
import os
import re
import time

from confluent_kafka import Consumer, KafkaError, KafkaException

from neo4j_writer import write_row, record_failed_row

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [LOADER] %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

KAFKA_BOOTSTRAP = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
KAFKA_TOPIC = os.environ.get("KAFKA_TOPIC", "csv-rows")
CONSUMER_GROUP = os.environ.get("CONSUMER_GROUP", "sentinel-loader")


def wait_for_kafka(retries: int = 30, delay: float = 3.0) -> Consumer:
    """Wait until Kafka is available, then return a connected consumer."""
    conf = {
        "bootstrap.servers": KAFKA_BOOTSTRAP,
        "group.id": CONSUMER_GROUP,
        "auto.offset.reset": "earliest",
        "enable.auto.commit": True,
        "session.timeout.ms": 30000,
        "heartbeat.interval.ms": 3000,
    }

    for attempt in range(retries):
        try:
            consumer = Consumer(conf)
            consumer.subscribe([KAFKA_TOPIC])
            # Quick poll to verify connection
            msg = consumer.poll(timeout=2.0)
            logger.info("Kafka connected on attempt %d", attempt + 1)
            return consumer
        except Exception as e:
            logger.warning("Kafka not ready (attempt %d/%d): %s", attempt + 1, retries, e)
            time.sleep(delay)

    raise RuntimeError(f"Could not connect to Kafka after {retries} attempts")


def run_consumer() -> None:
    logger.info("Starting loader — connecting to Kafka at %s", KAFKA_BOOTSTRAP)
    consumer = wait_for_kafka()
    logger.info("Subscribed to topic: %s", KAFKA_TOPIC)

    processed = 0
    failed = 0

    try:
        while True:
            msg = consumer.poll(timeout=1.0)

            if msg is None:
                continue

            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    logger.debug("End of partition reached")
                    continue
                else:
                    logger.error("Kafka error: %s", msg.error())
                    continue

            dataset_id = None
            try:
                raw_bytes = msg.value()
                if raw_bytes:
                    raw_str = raw_bytes.decode("utf-8")
                    m = re.search(r'"dataset_id":\s*"([^"]+)"', raw_str)
                    if m:
                        dataset_id = m.group(1)
                    payload = json.loads(raw_str)
                    job_id = payload["job_id"]
                    dataset_id = payload.get("dataset_id", dataset_id)
                    row_index = payload["row_index"]
                    data = payload["data"]

                    write_row(
                        job_id=job_id,
                        dataset_id=dataset_id,
                        row_index=row_index,
                        data=data,
                    )
                    processed += 1

                    if processed % 100 == 0:
                        logger.info("Processed %d rows (failed: %d)", processed, failed)

            except json.JSONDecodeError as e:
                logger.error("Invalid JSON in message: %s", e)
                failed += 1
                if dataset_id:
                    record_failed_row(dataset_id)
            except KeyError as e:
                logger.error("Missing field in message: %s", e)
                failed += 1
                if dataset_id:
                    record_failed_row(dataset_id)
            except Exception as e:
                logger.error("Failed to write row: %s", e)
                failed += 1
                if dataset_id:
                    record_failed_row(dataset_id)


    except KeyboardInterrupt:
        logger.info("Loader interrupted — shutting down")
    finally:
        consumer.close()
        logger.info("Consumer closed. Total processed: %d, failed: %d", processed, failed)


if __name__ == "__main__":
    run_consumer()
