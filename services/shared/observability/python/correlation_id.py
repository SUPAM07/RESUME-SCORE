"""
Correlation ID middleware for ResumeLM Python (FastAPI/Starlette) microservices.

A correlation ID (also called a request ID or trace ID) is a UUID generated
at the edge (API Gateway or first service) and propagated through every
downstream service via the ``X-Request-ID`` HTTP header.  It is attached to
every log entry so that all activity related to a single user request can be
found with a single query.

Usage::

    # In main.py:
    from services.shared.observability.python.correlation_id import (
        CorrelationIdMiddleware,
        get_correlation_id,
        correlation_id_var,
    )

    app.add_middleware(CorrelationIdMiddleware)

    # Anywhere in a request handler:
    request_id = get_correlation_id()   # may return None outside a request

    # Propagate to downstream HTTP calls:
    headers = {"X-Request-ID": get_correlation_id() or ""}
"""

from __future__ import annotations

import uuid
from contextvars import ContextVar
from typing import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: The HTTP header used to carry the correlation / request ID.
CORRELATION_ID_HEADER: str = "x-request-id"

# ---------------------------------------------------------------------------
# Context variable — one value per async task / request
# ---------------------------------------------------------------------------

#: ContextVar that stores the active correlation ID for the current
#: async context.  Read via :func:`get_correlation_id`; set by the
#: :class:`CorrelationIdMiddleware`.
correlation_id_var: ContextVar[str | None] = ContextVar(
    "correlation_id", default=None
)


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


def get_correlation_id() -> str | None:
    """Return the correlation ID for the current request, or ``None``."""
    return correlation_id_var.get()


# ---------------------------------------------------------------------------
# Starlette middleware
# ---------------------------------------------------------------------------


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """
    Starlette / FastAPI middleware that ensures every request has a
    correlation ID.

    - Reuses the ``X-Request-ID`` header value sent by a client or upstream
      proxy when present.
    - Generates a new UUIDv4 otherwise.

    The ID is stored in a ``ContextVar`` so that :func:`get_correlation_id`
    works anywhere in the async call chain without explicit passing.  It is
    also written back to the response as ``X-Request-ID``.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        raw = request.headers.get(CORRELATION_ID_HEADER, "").strip()
        correlation_id = raw if raw else str(uuid.uuid4())

        # Store in context for the duration of this request
        token = correlation_id_var.set(correlation_id)
        try:
            response: Response = await call_next(request)
        finally:
            # Always reset to avoid leaking across tasks
            correlation_id_var.reset(token)

        response.headers[CORRELATION_ID_HEADER] = correlation_id
        return response
