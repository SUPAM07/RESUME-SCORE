"""
Shared OpenTelemetry tracing setup for ResumeLM Python microservices.

Usage (must be called at module load time before other imports):

    # In main.py or app startup:
    from services.shared.observability.python.tracing import init_tracing
    init_tracing(service_name="auth-service", service_version="1.0.0")

Environment variables:
    OTEL_EXPORTER_OTLP_ENDPOINT  – OTLP collector URL (default: http://jaeger:4318)
    ENABLE_TRACING               – Set to "false" to disable (default: enabled)
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

_initialized = False


def init_tracing(
    service_name: str,
    service_version: str = "1.0.0",
    otlp_endpoint: str | None = None,
) -> None:
    """
    Initialise the OpenTelemetry SDK with OTLP export.

    Safe to call multiple times — subsequent calls are no-ops.
    Does nothing if ENABLE_TRACING=false.
    """
    global _initialized

    if os.getenv("ENABLE_TRACING", "true").lower() == "false":
        return

    if _initialized:
        return

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
            OTLPSpanExporter,
        )
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
        from opentelemetry.instrumentation.redis import RedisInstrumentor
        from opentelemetry.sdk.resources import SERVICE_NAME, SERVICE_VERSION, Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        endpoint = (
            otlp_endpoint
            or os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://jaeger:4318")
        )

        resource = Resource.create(
            {
                SERVICE_NAME: service_name,
                SERVICE_VERSION: service_version,
            }
        )

        provider = TracerProvider(resource=resource)

        exporter = OTLPSpanExporter(endpoint=f"{endpoint}/v1/traces")
        provider.add_span_processor(BatchSpanProcessor(exporter))

        trace.set_tracer_provider(provider)

        # Auto-instrument FastAPI, HTTPX and Redis
        FastAPIInstrumentor().instrument()
        HTTPXClientInstrumentor().instrument()
        RedisInstrumentor().instrument()

        _initialized = True
        logger.info(
            "OpenTelemetry tracing initialised",
            extra={"service": service_name, "endpoint": endpoint},
        )

    except ImportError as exc:
        logger.warning(
            "OpenTelemetry packages not installed — tracing disabled. "
            "Install opentelemetry-sdk and related packages to enable. "
            "Error: %s",
            exc,
        )
