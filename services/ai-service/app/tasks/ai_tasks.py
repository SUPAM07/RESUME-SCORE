"""Background Celery tasks for long-running AI operations."""

from __future__ import annotations

import asyncio
from typing import Any

from app.config import get_settings
from app.models.requests import (
    ATSScoreRequest,
    CoverLetterRequest,
    ResumeData,
    ResumeScoreRequest,
    TailorResumeRequest,
)
from app.services.optimize_service import tailor_resume
from app.services.score_service import (
    generate_cover_letter,
    score_ats,
    score_resume,
)
from app.tasks.celery_app import celery_app
from app.utils.logger import get_logger

logger = get_logger(__name__)


def _run_async(coro: Any) -> Any:
    """Run an async coroutine from a synchronous Celery task."""
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# Tailor resume task
# ---------------------------------------------------------------------------


@celery_app.task(
    name="ai_tasks.tailor_resume",
    bind=True,
    max_retries=2,
    default_retry_delay=5,
)
def tailor_resume_task(
    self: Any,
    resume_data: dict[str, Any],
    job_description: str,
    job_title: str,
    company_name: str,
    model: str,
    provider: str,
) -> dict[str, Any]:
    """Celery task: tailor a resume to a job description asynchronously."""
    settings = get_settings()
    try:
        logger.info(
            "tailor_resume_task_start",
            task_id=self.request.id,
            provider=provider,
            model=model,
        )
        resume = ResumeData(**resume_data)
        result = _run_async(
            tailor_resume(
                resume=resume,
                job_description=job_description,
                job_title=job_title,
                company_name=company_name,
                model=model,
                provider=provider,
                settings=settings,
            )
        )
        logger.info("tailor_resume_task_complete", task_id=self.request.id)
        return {"resume": result}
    except Exception as exc:
        logger.error(
            "tailor_resume_task_error",
            task_id=self.request.id,
            error=str(exc),
        )
        raise self.retry(exc=exc) from exc


# ---------------------------------------------------------------------------
# ATS score task
# ---------------------------------------------------------------------------


@celery_app.task(
    name="ai_tasks.score_ats",
    bind=True,
    max_retries=2,
    default_retry_delay=5,
)
def score_ats_task(
    self: Any,
    resume_data: dict[str, Any],
    job_description: str,
    model: str,
    provider: str,
) -> dict[str, Any]:
    """Celery task: score resume for ATS compatibility."""
    settings = get_settings()
    try:
        request = ATSScoreRequest(
            resume=ResumeData(**resume_data),
            job_description=job_description,
            model=model,
            provider=provider,
        )
        result = _run_async(score_ats(request, settings))
        return result
    except Exception as exc:
        logger.error("score_ats_task_error", task_id=self.request.id, error=str(exc))
        raise self.retry(exc=exc) from exc


# ---------------------------------------------------------------------------
# Cover letter task
# ---------------------------------------------------------------------------


@celery_app.task(
    name="ai_tasks.generate_cover_letter",
    bind=True,
    max_retries=2,
    default_retry_delay=5,
)
def generate_cover_letter_task(
    self: Any,
    resume_data: dict[str, Any],
    job_description: str,
    job_title: str,
    company_name: str,
    tone: str,
    model: str,
    provider: str,
) -> dict[str, Any]:
    """Celery task: generate a cover letter."""
    settings = get_settings()
    try:
        request = CoverLetterRequest(
            resume=ResumeData(**resume_data),
            job_description=job_description,
            job_title=job_title,
            company_name=company_name,
            tone=tone,
            model=model,
            provider=provider,
        )
        cover_letter = _run_async(generate_cover_letter(request, settings))
        return {"cover_letter": cover_letter, "word_count": len(cover_letter.split())}
    except Exception as exc:
        logger.error(
            "cover_letter_task_error", task_id=self.request.id, error=str(exc)
        )
        raise self.retry(exc=exc) from exc
