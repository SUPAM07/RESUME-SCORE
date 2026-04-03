"""
Shared structured JSON logging configuration for ResumeLM Python microservices.

Usage:
    # At the top of main.py (call once before other imports)
    from services.shared.observability.python.logging_config import setup_logging, get_logger

    setup_logging(service_name="auth-service")
    logger = get_logger(__name__)
    logger.info("Service started", extra={"port": 8001})

Environment variables:
    LOG_LEVEL   – Minimum log level (default: "info" in production, "debug" otherwise)
    LOG_FORMAT  – Output format: "json" (default in production) or "console"
    NODE_ENV    – When set to "production", forces JSON output and INFO log level
"""

from __future__ import annotations

import logging
import sys
from typing import Any

_configured = False

# Sensitive field names whose values are replaced with "[REDACTED]"
_SENSITIVE_KEYS = frozenset(
    {
        "password",
        "token",
        "access_token",
        "refresh_token",
        "api_key",
        "apiKey",
        "key",
        "secret",
        "authorization",
        "stripe_secret_key",
        "supabase_service_role_key",
    }
)


class _RedactingFilter(logging.Filter):
    """Logging filter that redacts known-sensitive keys from log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        if hasattr(record, "__dict__"):
            for key in list(record.__dict__.keys()):
                if key in _SENSITIVE_KEYS:
                    setattr(record, key, "[REDACTED]")
        return True


def _is_production() -> bool:
    import os

    return os.getenv("NODE_ENV", "").lower() == "production"


def _resolve_log_level() -> int:
    import os

    level_name = os.getenv("LOG_LEVEL", "info" if _is_production() else "debug").upper()
    level = getattr(logging, level_name, None)
    if not isinstance(level, int):
        level = logging.INFO
    return level


def _use_json_format() -> bool:
    import os

    fmt = os.getenv("LOG_FORMAT", "json" if _is_production() else "console").lower()
    return fmt == "json"


class _JsonFormatter(logging.Formatter):
    """Minimal JSON formatter – one JSON object per line."""

    def __init__(self, service_name: str) -> None:
        super().__init__()
        self._service = service_name

    def format(self, record: logging.LogRecord) -> str:
        import json
        from datetime import datetime, timezone

        level_map = {
            logging.DEBUG: "debug",
            logging.INFO: "info",
            logging.WARNING: "warn",
            logging.ERROR: "error",
            logging.CRITICAL: "error",
        }

        entry: dict[str, Any] = {
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
            "level": level_map.get(record.levelno, "info"),
            "service": self._service,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Attach extra fields set via `extra=` in log calls
        skip = frozenset(logging.LogRecord(
            "", 0, "", 0, "", (), None
        ).__dict__.keys()) | {"message", "asctime"}
        for key, value in record.__dict__.items():
            if key not in skip and not key.startswith("_"):
                if key in _SENSITIVE_KEYS:
                    entry[key] = "[REDACTED]"
                else:
                    entry[key] = value

        if record.exc_info:
            entry["exc_info"] = self.formatException(record.exc_info)

        return json.dumps(entry, default=str)


class _ConsoleFormatter(logging.Formatter):
    """Human-readable formatter for local development."""

    _COLORS = {
        "DEBUG": "\033[36m",  # cyan
        "INFO": "\033[32m",   # green
        "WARNING": "\033[33m",  # yellow
        "ERROR": "\033[31m",   # red
        "CRITICAL": "\033[35m",  # magenta
    }
    _RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self._COLORS.get(record.levelname, "")
        level = f"{color}{record.levelname:<8}{self._RESET}"
        msg = record.getMessage()

        # Collect extra fields
        skip = frozenset(logging.LogRecord(
            "", 0, "", 0, "", (), None
        ).__dict__.keys()) | {"message", "asctime"}
        extras = {
            k: v
            for k, v in record.__dict__.items()
            if k not in skip and not k.startswith("_")
        }
        extra_str = f" {extras}" if extras else ""

        ts = self.formatTime(record, "%H:%M:%S")
        return f"{ts} {level} [{record.name}]: {msg}{extra_str}"


def setup_logging(service_name: str = "service") -> None:
    """
    Configure the root Python logger.

    Safe to call multiple times — subsequent calls are no-ops unless
    ``force=True`` is passed (useful in tests).

    Args:
        service_name: Short service identifier included in every log entry.
    """
    global _configured
    if _configured:
        return

    level = _resolve_log_level()
    use_json = _use_json_format()

    formatter: logging.Formatter
    if use_json:
        formatter = _JsonFormatter(service_name=service_name)
    else:
        formatter = _ConsoleFormatter()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    handler.addFilter(_RedactingFilter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)

    # Silence noisy third-party loggers that produce too much noise
    for noisy in ("uvicorn.access", "httpx", "httpcore", "asyncio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    _configured = True


def get_logger(name: str) -> logging.Logger:
    """
    Return a standard Python logger with the given name.

    Calls :func:`setup_logging` lazily if it has not been called yet.

    Args:
        name: Logger name — typically ``__name__`` of the calling module.

    Returns:
        A configured :class:`logging.Logger` instance.

    Example::

        logger = get_logger(__name__)
        logger.info("Request received", extra={"path": "/health"})
    """
    if not _configured:
        setup_logging()
    return logging.getLogger(name)
