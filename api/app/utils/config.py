"""Application settings loaded from environment variables."""
from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Neo4j
    neo4j_uri: str = "bolt://neo4j:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str  # Required: must be set via NEO4J_PASSWORD environment variable

    # Kafka
    kafka_bootstrap_servers: str = "kafka:9092"
    kafka_topic: str = "csv-rows"

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    max_upload_size_mb: int = 50
    rate_limit_per_minute: int = 120

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:5173,http://localhost:80"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()
