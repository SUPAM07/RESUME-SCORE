"""Optimize router — resume tailoring, text import, bullet improvement."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.dependencies import CurrentUserID
from app.models.requests import (
    ImproveExperienceRequest,
    ImproveProjectRequest,
    TailorResumeRequest,
    TextImportRequest,
)
from app.models.responses import (
    ImproveBulletResponse,
    TailorResumeResponse,
    TaskCreatedResponse,
    TextImportResponse,
)
from app.services.optimize_service import (
    import_from_text,
    improve_experience_bullet,
    improve_project_bullet,
)
from app.tasks.ai_tasks import tailor_resume_task
from app.utils.logger import get_logger

router = APIRouter(prefix="/optimize", tags=["optimize"])
logger = get_logger(__name__)


@router.post("/tailor", response_model=TaskCreatedResponse)
async def tailor_resume_endpoint(
    body: TailorResumeRequest,
    user_id: CurrentUserID,
    settings: Settings = Depends(get_settings),
) -> TaskCreatedResponse:
    """Enqueue an async Celery task to tailor the resume to a job description.

    Returns a ``task_id`` to poll via ``GET /tasks/{task_id}``.
    """
    logger.info("tailor_resume_enqueued", user_id=user_id, provider=body.provider)
    task = tailor_resume_task.delay(
        resume_data=body.resume.model_dump(),
        job_description=body.job_description,
        job_title=body.job_title,
        company_name=body.company_name,
        model=body.model,
        provider=body.provider,
    )
    return TaskCreatedResponse(task_id=task.id, status="pending")


@router.post("/text-import", response_model=TextImportResponse)
async def text_import_endpoint(
    body: TextImportRequest,
    user_id: CurrentUserID,
    settings: Settings = Depends(get_settings),
) -> TextImportResponse:
    """Convert arbitrary text (resume, LinkedIn, etc.) into a structured resume JSON."""
    logger.info("text_import_request", user_id=user_id, provider=body.provider)
    resume_data = await import_from_text(
        text=body.text,
        model=body.model,
        provider=body.provider,
        settings=settings,
    )
    return TextImportResponse(resume=resume_data)


@router.post("/improve-experience", response_model=ImproveBulletResponse)
async def improve_experience_endpoint(
    body: ImproveExperienceRequest,
    user_id: CurrentUserID,
    settings: Settings = Depends(get_settings),
) -> ImproveBulletResponse:
    """Improve a single work experience bullet point using ATS-optimized language."""
    logger.info("improve_experience_request", user_id=user_id)
    improved = await improve_experience_bullet(request=body, settings=settings)
    return ImproveBulletResponse(
        improved_bullet=improved,
        original_bullet=body.bullet,
    )


@router.post("/improve-project", response_model=ImproveBulletResponse)
async def improve_project_endpoint(
    body: ImproveProjectRequest,
    user_id: CurrentUserID,
    settings: Settings = Depends(get_settings),
) -> ImproveBulletResponse:
    """Improve a single project description bullet point."""
    logger.info("improve_project_request", user_id=user_id)
    improved = await improve_project_bullet(request=body, settings=settings)
    return ImproveBulletResponse(
        improved_bullet=improved,
        original_bullet=body.bullet,
    )
