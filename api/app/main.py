"""Data Sentinel — FastAPI main application."""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import health, ingest, chat, analytics, security
from app.security.rate_limiter import RateLimitMiddleware
from app.services.neo4j_service import initialize_constraints
from app.utils.config import get_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(
    title="Data Sentinel API",
    description="Real-Time CSV Intelligence, Graph Analytics & Secure Data Operations",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Rate limiting + security tracking ───────────────────────────────────────
app.add_middleware(RateLimitMiddleware, requests_per_minute=settings.rate_limit_per_minute)

# ─── Routes ───────────────────────────────────────────────────────────────────
app.include_router(health.router)
app.include_router(ingest.router)
app.include_router(chat.router)
app.include_router(analytics.router)
app.include_router(security.router)


# ─── Startup ──────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    logger.info("Data Sentinel API starting up...")
    try:
        initialize_constraints()
        logger.info("Neo4j constraints initialized")
    except Exception as e:
        logger.warning("Could not initialize Neo4j constraints: %s", e)


@app.get("/")
async def root():
    return {
        "service": "Data Sentinel API",
        "version": "1.0.0",
        "docs": "/docs",
    }
