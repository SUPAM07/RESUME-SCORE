"""
Structured logging for all Python microservices.
Uses structlog for JSON-formatted, context-enriched logging.
"""
import logging
import os
import sys
from typing import Any

import structlog


def configure_logging() -> None:
    """Configure structlog for the service. Call once at startup."""
    log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
    is_dev = os.environ.get("NODE_ENV", "development") == "development"

    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_logger_name,
    ]

    if is_dev:
        # Human-readable in development
        processors = shared_processors + [
            structlog.dev.ConsoleRenderer(colors=True),
        ]
    else:
        # JSON in production (for log aggregators)
        processors = shared_processors + [
            structlog.processors.dict_tracebacks,
            structlog.processors.JSONRenderer(),
        ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, log_level, logging.INFO)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(sys.stdout),
        cache_logger_on_first_use=True,
    )


def get_logger(
    service: str | None = None,
    **context: Any,
) -> structlog.BoundLogger:
    """
    Get a bound logger with service and context injected.

    Usage:
        logger = get_logger("ai-service", request_id="abc-123")
        logger.info("Analysis started", resume_id="r-456")
    """
    log = structlog.get_logger()
    bind_ctx: dict[str, Any] = {}

    if service:
        bind_ctx["service"] = service
    elif (env_service := os.environ.get("SERVICE_NAME")):
        bind_ctx["service"] = env_service

    bind_ctx.update(context)
    return log.bind(**bind_ctx) if bind_ctx else log


# Auto-configure on import
configure_logging()
