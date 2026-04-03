"""
Redis Streams event consumer for the AI service.

Subscribes to the 'resumelm:events' stream (consumer group: ai-service)
and reacts to domain events by enqueuing Celery tasks.

Supported events:
  resume.created  → auto-queue ATS score if resume is tailored
  job.created     → (future) auto-score linked resumes
  job.updated     → (future) re-score linked resumes
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

STREAM_KEY = os.getenv("REDIS_STREAM_KEY", "resumelm:events")
GROUP_NAME = "ai-service"
BATCH_SIZE = 10
BLOCK_MS = 5_000
MAX_RETRIES = 3

_running = False


def _build_consumer_name() -> str:
    import os as _os
    return f"ai-service-{_os.getpid()}"


async def _ensure_group(client: Any) -> None:
    try:
        await client.xgroup_create(STREAM_KEY, GROUP_NAME, "$", mkstream=True)
    except Exception as exc:  # noqa: BLE001
        if "BUSYGROUP" not in str(exc):
            raise


async def _process_message(message_id: str, fields: dict[str, str]) -> None:
    """Handle a single event message."""
    try:
        event: dict[str, Any] = json.loads(fields.get("payload", "{}"))
    except json.JSONDecodeError:
        logger.warning("Failed to parse event payload", extra={"message_id": message_id})
        return

    event_type: str = event.get("type", "")
    data: dict[str, Any] = event.get("data", {})

    logger.info(
        "ai_service_event_received",
        extra={"event_type": event_type, "event_id": event.get("id")},
    )

    if event_type == "resume.created":
        # Auto-queue ATS scoring for tailored resumes
        resume_type = data.get("resumeType", "")
        resume_id = data.get("resumeId", "")
        job_id = data.get("jobId")
        if resume_type == "tailored" and resume_id and job_id:
            try:
                from app.tasks.ai_tasks import score_resume_task  # noqa: PLC0415

                score_resume_task.apply_async(
                    kwargs={"resume_id": resume_id, "job_id": job_id},
                    queue="ai_light",
                )
                logger.info(
                    "Auto-queued ATS score",
                    extra={"resume_id": resume_id, "job_id": job_id},
                )
            except Exception as exc:  # noqa: BLE001
                logger.error("Failed to enqueue score task", exc_info=exc)

    elif event_type in ("job.updated", "job.created"):
        # Future: re-score resumes linked to this job
        logger.debug("Job event received (no-op)", extra={"event_type": event_type})


async def start_event_consumer() -> None:
    """Start the Redis Streams consumer loop.  Call from the FastAPI lifespan."""
    global _running  # noqa: PLW0603

    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    try:
        import redis.asyncio as aioredis  # noqa: PLC0415
    except ImportError:
        logger.warning("redis asyncio not available – event consumer disabled")
        return

    client = aioredis.from_url(redis_url, decode_responses=True)

    try:
        await _ensure_group(client)
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to create consumer group", exc_info=exc)
        await client.aclose()
        return

    consumer_name = _build_consumer_name()
    _running = True
    logger.info(
        "AI event consumer started",
        extra={"stream": STREAM_KEY, "group": GROUP_NAME, "consumer": consumer_name},
    )

    while _running:
        try:
            messages = await client.xreadgroup(
                GROUP_NAME,
                consumer_name,
                {STREAM_KEY: ">"},
                count=BATCH_SIZE,
                block=BLOCK_MS,
            )

            if not messages:
                continue

            for _stream, entries in messages:
                for message_id, fields in entries:
                    await _process_message(message_id, fields)
                    await client.xack(STREAM_KEY, GROUP_NAME, message_id)

        except asyncio.CancelledError:
            break
        except Exception as exc:  # noqa: BLE001
            if not _running:
                break
            logger.error("Event consumer poll error", exc_info=exc)
            await asyncio.sleep(1)

    await client.aclose()
    logger.info("AI event consumer stopped")


def stop_event_consumer() -> None:
    global _running  # noqa: PLW0603
    _running = False
