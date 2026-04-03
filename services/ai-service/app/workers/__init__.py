"""
Async Celery workers for processing AI tasks from the Kafka event bus.
Workers consume events and run the appropriate AI pipeline.
"""
from celery import Celery
from ..config import settings

# AI worker tasks are defined here and registered with Celery
# Kafka consumers (in app/events/) trigger these tasks

celery_app = Celery(
    "ai-service",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.analysis", "app.workers.scoring", "app.workers.parsing"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,                # Only ack after successful completion
    worker_prefetch_multiplier=1,       # Process one task at a time per worker
    task_reject_on_worker_lost=True,    # Re-queue if worker dies mid-task
    task_default_retry_delay=30,
    task_max_retries=3,
    worker_max_tasks_per_child=100,     # Restart worker after 100 tasks (memory safety)
)
