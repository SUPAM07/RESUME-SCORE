"""
Prometheus metrics for ResumeLM Python microservices.

Exposes a /metrics endpoint using the prometheus_client library.

Usage:

    # In main.py:
    from services.shared.observability.python.metrics import (
        add_metrics_route,
        request_count,
        request_latency,
    )

    add_metrics_route(app)

    # In a route or middleware:
    with request_latency.labels(service="auth-service", method="GET", route="/health").time():
        ...
    request_count.labels(
        service="auth-service", method="GET", route="/health", status_code="200"
    ).inc()
"""

from __future__ import annotations

import os
import time
from typing import Callable

from fastapi import FastAPI, Request, Response


def _prometheus_available() -> bool:
    try:
        import prometheus_client  # noqa: F401

        return True
    except ImportError:
        return False


def add_metrics_middleware(app: FastAPI, service_name: str) -> None:
    """
    Register a Starlette middleware that records per-request Prometheus metrics.
    If prometheus_client is not installed the function is a no-op.
    """
    if not _prometheus_available():
        return

    from prometheus_client import Counter, Histogram

    REQUEST_COUNT = Counter(
        "http_requests_total",
        "Total HTTP requests",
        ["service", "method", "route", "status_code"],
    )
    REQUEST_LATENCY = Histogram(
        "http_request_duration_seconds",
        "HTTP request latency",
        ["service", "method", "route"],
        buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
    )

    @app.middleware("http")
    async def _metrics_middleware(
        request: Request, call_next: Callable[[Request], Response]
    ) -> Response:
        start = time.perf_counter()
        response: Response = await call_next(request)
        duration = time.perf_counter() - start

        route = request.url.path
        REQUEST_LATENCY.labels(
            service=service_name, method=request.method, route=route
        ).observe(duration)
        REQUEST_COUNT.labels(
            service=service_name,
            method=request.method,
            route=route,
            status_code=str(response.status_code),
        ).inc()

        return response


def add_metrics_route(app: FastAPI) -> None:
    """
    Add a GET /metrics endpoint that serves Prometheus text-format metrics.
    If prometheus_client is not installed, /metrics returns a 501.
    """
    if _prometheus_available():
        from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

        @app.get("/metrics", include_in_schema=False)
        async def metrics() -> Response:
            return Response(
                content=generate_latest(),
                media_type=CONTENT_TYPE_LATEST,
            )

    else:

        @app.get("/metrics", include_in_schema=False)
        async def metrics_unavailable() -> Response:  # type: ignore[misc]
            return Response(
                content="prometheus_client not installed",
                status_code=501,
                media_type="text/plain",
            )
