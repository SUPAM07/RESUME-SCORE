"""Optimize service — resume tailoring, text import, bullet improvement."""

from __future__ import annotations

import json
from typing import Any

from app.config import Settings
from app.models.requests import (
    ImproveExperienceRequest,
    ImproveProjectRequest,
    ResumeData,
    TextImportRequest,
)
from app.services.ai_client import Message, complete, complete_json
from app.utils.logger import get_logger
from app.utils.prompts import (
    PROJECT_IMPROVER_PROMPT,
    RESUME_TAILOR_SYSTEM_PROMPT,
    TEXT_IMPORT_SYSTEM_PROMPT,
    WORK_EXPERIENCE_IMPROVER_PROMPT,
)

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Resume tailoring
# ---------------------------------------------------------------------------


async def tailor_resume(
    resume: ResumeData,
    job_description: str,
    job_title: str,
    company_name: str,
    model: str,
    provider: str,
    settings: Settings,
) -> dict[str, Any]:
    """Tailor a resume to a job description. Returns the modified resume dict."""
    job_context = f"Job Title: {job_title}\nCompany: {company_name}\n\nJob Description:\n{job_description}"

    messages: list[Message] = [
        {"role": "system", "content": RESUME_TAILOR_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Please tailor the following resume for this role.\n\n"
                f"=== TARGET ROLE ===\n{job_context}\n\n"
                f"=== RESUME TO TAILOR ===\n{json.dumps(resume.model_dump(), indent=2)}"
            ),
        },
    ]

    logger.info(
        "tailor_resume_start",
        provider=provider,
        model=model,
        job_title=job_title,
        company=company_name,
    )

    return await complete_json(messages, model, provider, settings)


# ---------------------------------------------------------------------------
# Text import
# ---------------------------------------------------------------------------


async def import_from_text(
    text: str,
    model: str,
    provider: str,
    settings: Settings,
) -> dict[str, Any]:
    """Extract structured resume data from arbitrary text."""
    messages: list[Message] = [
        {"role": "system", "content": TEXT_IMPORT_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                "Please extract and structure the following text into a resume JSON object:\n\n"
                + text
            ),
        },
    ]

    logger.info("text_import_start", provider=provider, model=model)
    return await complete_json(messages, model, provider, settings)


# ---------------------------------------------------------------------------
# Improve work experience bullet
# ---------------------------------------------------------------------------


async def improve_experience_bullet(
    request: ImproveExperienceRequest,
    settings: Settings,
) -> str:
    """Return an improved version of a single work experience bullet."""
    context_parts = [f"Bullet to improve:\n{request.bullet}"]
    if request.position:
        context_parts.append(f"Position: {request.position}")
    if request.company:
        context_parts.append(f"Company: {request.company}")
    if request.job_description:
        context_parts.append(f"\nTarget Job Description:\n{request.job_description}")

    messages: list[Message] = [
        {"role": "system", "content": WORK_EXPERIENCE_IMPROVER_PROMPT},
        {"role": "user", "content": "\n".join(context_parts)},
    ]

    logger.info(
        "improve_experience_bullet_start",
        provider=request.provider,
        model=request.model,
    )

    result = await complete(
        messages,
        request.model,
        request.provider,
        settings,
        max_tokens=512,
    )
    return result.strip()


# ---------------------------------------------------------------------------
# Improve project bullet
# ---------------------------------------------------------------------------


async def improve_project_bullet(
    request: ImproveProjectRequest,
    settings: Settings,
) -> str:
    """Return an improved version of a single project bullet."""
    context_parts = [f"Bullet to improve:\n{request.bullet}"]
    if request.project_name:
        context_parts.append(f"Project: {request.project_name}")
    if request.job_description:
        context_parts.append(f"\nTarget Job Description:\n{request.job_description}")

    messages: list[Message] = [
        {"role": "system", "content": PROJECT_IMPROVER_PROMPT},
        {"role": "user", "content": "\n".join(context_parts)},
    ]

    logger.info(
        "improve_project_bullet_start",
        provider=request.provider,
        model=request.model,
    )

    result = await complete(
        messages,
        request.model,
        request.provider,
        settings,
        max_tokens=512,
    )
    return result.strip()
