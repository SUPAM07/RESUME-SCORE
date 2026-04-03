"""FastAPI application entry point for the Auth Service."""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from starlette.requests import Request as StarletteRequest
from starlette.responses import Response as StarletteResponse
from starlette.types import ASGIApp

from app.config import get_settings
from app.routers import auth, profile, subscription
from app.utils.exceptions import register_exception_handlers
from app.utils.logger import get_logger, setup_logging

# Initialise distributed tracing before the rest of the app
try:
    from services.shared.observability.python.tracing import init_tracing

    init_tracing(service_name="auth-service", service_version="1.0.0")
except ImportError:
    pass  # Shared observability package optional in local dev

setup_logging()
logger = get_logger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# Rate limiter (Redis-backed via slowapi)
# ---------------------------------------------------------------------------

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.redis_url,
    default_limits=[settings.rate_limit_default],
    # Degrade gracefully when the Redis backend is unavailable rather than
    # returning 500 errors to clients.
    swallow_errors=True,
)


class _SafeSlowAPIMiddleware(SlowAPIMiddleware):
    """SlowAPI middleware that degrades gracefully when the Redis backend is
    unavailable.  The parent class accesses ``request.state.view_rate_limit``
    unconditionally after ``_check_request_limit``; when Redis is down and
    ``swallow_errors=True`` that attribute is never set, causing an
    ``AttributeError``.  This subclass guards the access with ``getattr``.
    """

    async def dispatch(self, request: StarletteRequest, call_next) -> StarletteResponse:
        from slowapi.middleware import (  # type: ignore[attr-defined]
            _find_route_handler,
            _should_exempt,
            sync_check_limits,
        )

        app_limiter: Limiter = request.app.state.limiter
        if not app_limiter.enabled:
            return await call_next(request)

        handler = _find_route_handler(request.app.routes, request.scope)
        if _should_exempt(app_limiter, handler):
            return await call_next(request)

        error_response, should_inject = sync_check_limits(
            app_limiter, request, handler, request.app
        )
        if error_response is not None:
            return error_response

        response = await call_next(request)

        if should_inject:
            view_rate_limit = getattr(request.state, "view_rate_limit", None)
            if view_rate_limit is not None:
                response = app_limiter._inject_headers(response, view_rate_limit)

        return response

# ---------------------------------------------------------------------------
# Application lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info(
        "auth_service_starting",
        service=settings.service_name,
        version=settings.service_version,
        env=settings.env,
        port=settings.port,
    )
    yield
    logger.info("auth_service_stopped")


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="ResumeLM Auth Service",
    description=(
        "Authentication, JWT validation, user profiles, and subscription management "
        "for the ResumeLM microservices architecture."
    ),
    version=settings.service_version,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

# ── Rate limiting ─────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(_SafeSlowAPIMiddleware)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Custom exception handlers ─────────────────────────────────────────────────
register_exception_handlers(app)

# ---------------------------------------------------------------------------
# Request-ID middleware
# ---------------------------------------------------------------------------

# Prefer the shared CorrelationIdMiddleware; fall back to inline implementation
try:
    from services.shared.observability.python.correlation_id import (
        CorrelationIdMiddleware,
    )

    app.add_middleware(CorrelationIdMiddleware)
except ImportError:
    # Inline fallback when the shared package is not on sys.path
    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id

        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            path=request.url.path,
            method=request.method,
        )

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(subscription.router)

# ---------------------------------------------------------------------------
# Prometheus metrics endpoint
# ---------------------------------------------------------------------------

try:
    from services.shared.observability.python.metrics import (
        add_metrics_middleware,
        add_metrics_route,
    )

    add_metrics_middleware(app, service_name="auth-service")
    add_metrics_route(app)
except ImportError:
    pass  # prometheus_client or shared package not installed

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/health", tags=["health"], summary="Service health check")
async def health(request: Request) -> dict:
    from datetime import datetime, timezone

    request_id: str = getattr(request.state, "request_id", str(uuid.uuid4()))

    # Check Redis connectivity
    redis_status = "ok"
    try:
        import redis.asyncio as aioredis

        r: aioredis.Redis = aioredis.from_url(
            settings.redis_url, socket_connect_timeout=1
        )
        await r.ping()
        await r.aclose()
    except Exception as exc:
        logger.warning("health_redis_unavailable", error=str(exc))
        redis_status = "down"

    overall = "ok" if redis_status == "ok" else "degraded"

    return {
        "success": True,
        "requestId": request_id,
        "data": {
            "status": overall,
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
            "service": settings.service_name,
            "version": settings.service_version,
            "dependencies": {
                "redis": redis_status,
            },
        },
    }
