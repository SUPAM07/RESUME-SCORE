"""Score service — ATS scoring and full resume evaluation."""

from __future__ import annotations

import json
from typing import Any

from app.config import Settings
from app.models.requests import ATSScoreRequest, CoverLetterRequest, ResumeScoreRequest
from app.services.ai_client import Message, complete_json
from app.utils.logger import get_logger
from app.utils.prompts import (
    ATS_SCORING_SYSTEM_PROMPT,
    COVER_LETTER_SYSTEM_PROMPT,
    RESUME_SCORE_SYSTEM_PROMPT,
)

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# ATS score
# ---------------------------------------------------------------------------


async def score_ats(
    request: ATSScoreRequest,
    settings: Settings,
) -> dict[str, Any]:
    """Score a resume against a job description for ATS compatibility."""
    messages: list[Message] = [
        {"role": "system", "content": ATS_SCORING_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"=== JOB DESCRIPTION ===\n{request.job_description}\n\n"
                f"=== RESUME ===\n{json.dumps(request.resume.model_dump(), indent=2)}"
            ),
        },
    ]

    logger.info("ats_score_start", provider=request.provider, model=request.model)
    return await complete_json(messages, request.model, request.provider, settings)


# ---------------------------------------------------------------------------
# Full resume score
# ---------------------------------------------------------------------------


async def score_resume(
    request: ResumeScoreRequest,
    settings: Settings,
) -> dict[str, Any]:
    """Holistic quality evaluation of a resume."""
    user_content = f"=== RESUME ===\n{json.dumps(request.resume.model_dump(), indent=2)}"
    if request.job_description:
        user_content = (
            f"=== TARGET JOB DESCRIPTION ===\n{request.job_description}\n\n"
            + user_content
        )

    messages: list[Message] = [
        {"role": "system", "content": RESUME_SCORE_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    logger.info("resume_score_start", provider=request.provider, model=request.model)
    return await complete_json(messages, request.model, request.provider, settings)


# ---------------------------------------------------------------------------
# Cover letter generation
# ---------------------------------------------------------------------------


async def generate_cover_letter(
    request: CoverLetterRequest,
    settings: Settings,
) -> str:
    """Generate a professional cover letter from resume + job description."""
    tone_instruction = {
        "professional": "Write in a professional, confident, and warm tone.",
        "enthusiastic": "Write with genuine enthusiasm and passion while staying professional.",
        "concise": "Write a brief, punchy cover letter (3 paragraphs maximum, 150-250 words).",
    }.get(request.tone, "Write in a professional tone.")

    user_content = (
        f"Tone instruction: {tone_instruction}\n\n"
        f"Job Title: {request.job_title or 'the advertised position'}\n"
        f"Company: {request.company_name or 'the company'}\n\n"
        f"=== JOB DESCRIPTION ===\n{request.job_description}\n\n"
        f"=== CANDIDATE RESUME ===\n{json.dumps(request.resume.model_dump(), indent=2)}"
    )

    messages: list[Message] = [
        {"role": "system", "content": COVER_LETTER_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    logger.info(
        "cover_letter_start",
        provider=request.provider,
        model=request.model,
        tone=request.tone,
    )

    from app.services.ai_client import complete

    result = await complete(
        messages, request.model, request.provider, settings, max_tokens=1024
    )
    return result.strip()
