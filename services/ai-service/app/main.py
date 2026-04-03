"""FastAPI application entry point for the AI Service."""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import get_settings
from app.models.responses import HealthResponse
from app.routers.chat import router as chat_router
from app.routers.optimize import router as optimize_router
from app.routers.tasks import cover_letter_router, score_router, tasks_router
from app.utils.exceptions import register_exception_handlers
from app.utils.logger import get_logger, setup_logging

# Initialise distributed tracing before the rest of the app
try:
    from services.shared.observability.python.tracing import init_tracing

    init_tracing(service_name="ai-service", service_version="1.0.0")
except ImportError:
    pass  # Shared observability package optional in local dev

setup_logging()
logger = get_logger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.redis_url,
    default_limits=[settings.rate_limit_default],
    swallow_errors=True,
)

# ---------------------------------------------------------------------------
# Application lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info(
        "ai_service_starting",
        service=settings.service_name,
        version=settings.service_version,
        env=settings.env,
        port=settings.port,
    )
    yield
    logger.info("ai_service_stopped")


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="ResumeLM AI Service",
    description=(
        "AI-powered resume operations: streaming chat, resume tailoring, "
        "ATS scoring, cover letter generation, and bullet point improvement."
    ),
    version=settings.service_version,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

# ── Middleware ────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── Request ID middleware ─────────────────────────────────────────────────────

# Prefer the shared CorrelationIdMiddleware; fall back to inline implementation
try:
    from services.shared.observability.python.correlation_id import (
        CorrelationIdMiddleware,
    )

    app.add_middleware(CorrelationIdMiddleware)
except ImportError:
    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


# ── Exception handlers ────────────────────────────────────────────────────────

register_exception_handlers(app)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(chat_router)
app.include_router(optimize_router)
app.include_router(score_router)
app.include_router(cover_letter_router)
app.include_router(tasks_router)

# ── Prometheus metrics ────────────────────────────────────────────────────────

try:
    from services.shared.observability.python.metrics import (
        add_metrics_middleware,
        add_metrics_route,
    )

    add_metrics_middleware(app, service_name="ai-service")
    add_metrics_route(app)
except ImportError:
    pass  # prometheus_client or shared package not installed


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/health", response_model=HealthResponse, tags=["health"])
async def health_check() -> HealthResponse:
    """Return service health status and configured provider availability."""
    providers = {
        "openai": bool(settings.openai_api_key),
        "anthropic": bool(settings.anthropic_api_key),
        "openrouter": bool(settings.openrouter_api_key),
    }
    return HealthResponse(
        status="ok",
        service=settings.service_name,
        version=settings.service_version,
        providers=providers,
    )
