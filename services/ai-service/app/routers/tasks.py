"""Routers for task status, ATS scoring, resume scoring, and cover letters."""

from __future__ import annotations

from celery.result import AsyncResult
from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.dependencies import CurrentUserID
from app.models.requests import ATSScoreRequest, CoverLetterRequest, ResumeScoreRequest
from app.models.responses import (
    ATSScoreBreakdown,
    ATSScoreResponse,
    CoverLetterResponse,
    ResumeScoreCategory,
    ResumeScoreResponse,
    TaskStatusResponse,
)
from app.services.score_service import (
    generate_cover_letter,
    score_ats,
    score_resume,
)
from app.tasks.celery_app import celery_app
from app.utils.exceptions import NotFoundError
from app.utils.logger import get_logger

tasks_router = APIRouter(prefix="/tasks", tags=["tasks"])
score_router = APIRouter(prefix="/score", tags=["score"])
cover_letter_router = APIRouter(prefix="/cover-letter", tags=["cover-letter"])
logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Task status
# ---------------------------------------------------------------------------


@tasks_router.get("/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(
    task_id: str,
    user_id: CurrentUserID,
) -> TaskStatusResponse:
    """Poll the status of an async Celery task by its ID."""
    result = AsyncResult(task_id, app=celery_app)

    state = result.state.lower()

    if state == "pending":
        return TaskStatusResponse(task_id=task_id, status="pending")

    if state == "started" or state == "progress":
        progress = getattr(result.info, "get", lambda k, d: d)("progress", None) if result.info else None
        return TaskStatusResponse(task_id=task_id, status="in_progress", progress=progress)

    if state == "success":
        return TaskStatusResponse(task_id=task_id, status="completed", result=result.result)

    if state == "failure":
        error_msg = str(result.result) if result.result else "Task failed"
        return TaskStatusResponse(task_id=task_id, status="failed", error=error_msg)

    return TaskStatusResponse(task_id=task_id, status=state)


# ---------------------------------------------------------------------------
# ATS score
# ---------------------------------------------------------------------------


@score_router.post("/ats", response_model=ATSScoreResponse)
async def ats_score_endpoint(
    body: ATSScoreRequest,
    user_id: CurrentUserID,
    settings: Settings = Depends(get_settings),
) -> ATSScoreResponse:
    """Score a resume against a job description for ATS compatibility."""
    logger.info("ats_score_request", user_id=user_id, provider=body.provider)
    data = await score_ats(body, settings)
    breakdown_data = data.get("breakdown", {})
    return ATSScoreResponse(
        overall_score=data.get("overall_score", 0),
        breakdown=ATSScoreBreakdown(
            keyword_match=breakdown_data.get("keyword_match", 0),
            format_score=breakdown_data.get("format_score", 0),
            section_completeness=breakdown_data.get("section_completeness", 0),
            readability=breakdown_data.get("readability", 0),
        ),
        matched_keywords=data.get("matched_keywords", []),
        missing_keywords=data.get("missing_keywords", []),
        recommendations=data.get("recommendations", []),
    )


# ---------------------------------------------------------------------------
# Full resume score
# ---------------------------------------------------------------------------


@score_router.post("/resume", response_model=ResumeScoreResponse)
async def resume_score_endpoint(
    body: ResumeScoreRequest,
    user_id: CurrentUserID,
    settings: Settings = Depends(get_settings),
) -> ResumeScoreResponse:
    """Holistic quality evaluation of a resume across five dimensions."""
    logger.info("resume_score_request", user_id=user_id, provider=body.provider)
    data = await score_resume(body, settings)

    def _category(key: str) -> ResumeScoreCategory:
        section = data.get(key, {})
        if isinstance(section, dict):
            return ResumeScoreCategory(
                score=section.get("score", 0),
                feedback=section.get("feedback", ""),
                suggestions=section.get("suggestions", []),
            )
        return ResumeScoreCategory(score=0, feedback="", suggestions=[])

    return ResumeScoreResponse(
        overall_score=data.get("overall_score", 0),
        impact=_category("impact"),
        brevity=_category("brevity"),
        style=_category("style"),
        sections=_category("sections"),
        skills=_category("skills"),
        summary=data.get("summary", ""),
    )


# ---------------------------------------------------------------------------
# Cover letter generation
# ---------------------------------------------------------------------------


@cover_letter_router.post("/generate", response_model=CoverLetterResponse)
async def generate_cover_letter_endpoint(
    body: CoverLetterRequest,
    user_id: CurrentUserID,
    settings: Settings = Depends(get_settings),
) -> CoverLetterResponse:
    """Generate a professional, personalized cover letter."""
    logger.info(
        "cover_letter_request",
        user_id=user_id,
        provider=body.provider,
        tone=body.tone,
    )
    letter = await generate_cover_letter(body, settings)
    return CoverLetterResponse(cover_letter=letter, word_count=len(letter.split()))
