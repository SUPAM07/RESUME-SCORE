"""
Event envelope schema shared between all Python microservices.
Mirrors packages/kafka/src/types.ts — MUST stay in sync.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Generic, TypeVar
from uuid import uuid4

from pydantic import BaseModel, Field

T = TypeVar("T")


class EventEnvelope(BaseModel, Generic[T]):
    """
    Standard wrapper for all events published to Kafka.
    Mirrors the TypeScript EventEnvelope<T> in packages/kafka/src/types.ts.
    """

    event_id: str = Field(default_factory=lambda: str(uuid4()))
    event_type: str
    aggregate_id: str
    aggregate_type: str
    occurred_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    version: int = 1
    data: T
    producer_service: str
    trace_id: str | None = None
    correlation_id: str | None = None
    schema_id: str | None = None

    model_config = {"arbitrary_types_allowed": True}

    def to_kafka_message(self) -> dict:
        """Serialize to a Kafka message payload."""
        return self.model_dump(exclude_none=True)

    @classmethod
    def create(
        cls,
        event_type: str,
        aggregate_id: str,
        aggregate_type: str,
        data: T,
        producer_service: str,
        correlation_id: str | None = None,
        trace_id: str | None = None,
    ) -> "EventEnvelope[T]":
        """Factory method for creating properly formatted events."""
        return cls(
            event_type=event_type,
            aggregate_id=aggregate_id,
            aggregate_type=aggregate_type,
            data=data,
            producer_service=producer_service,
            correlation_id=correlation_id,
            trace_id=trace_id,
        )


# ─── Typed event data models ──────────────────────────────────────────────────

class AIAnalysisRequestedData(BaseModel):
    resume_id: str
    user_id: str
    resume_text: str
    job_id: str | None = None
    job_description: str | None = None
    target_role: str | None = None
    priority: str = "NORMAL"
    model_preference: str | None = None


class AIAnalysisCompletedData(BaseModel):
    resume_id: str
    user_id: str
    job_id: str | None = None
    scores: dict[str, float]
    strengths: list[str]
    weaknesses: list[str]
    suggestions: list[str]
    keywords_found: list[str]
    keywords_missing: list[str]
    summary: str
    model_used: str


class AIParsingRequestedData(BaseModel):
    resume_id: str
    user_id: str
    file_url: str
    mime_type: str
