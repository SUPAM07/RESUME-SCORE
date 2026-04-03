"""Structured JSON logging via structlog."""

from __future__ import annotations

import logging
import sys

import structlog

from app.config import get_settings


def _configure_logging() -> None:
    settings = get_settings()

    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if settings.is_production:
        # Production: emit newline-delimited JSON
        shared_processors.append(structlog.processors.dict_tracebacks)
        renderer: structlog.types.Processor = structlog.processors.JSONRenderer()
    else:
        # Development: human-readable coloured output
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.DEBUG if not settings.is_production else logging.INFO)

    # Silence noisy third-party loggers
    for noisy in ("uvicorn.access", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


_configured = False


def setup_logging() -> None:
    global _configured
    if not _configured:
        _configure_logging()
        _configured = True


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Return a named structured logger bound to the given module name."""
    setup_logging()
    return structlog.get_logger(name)
