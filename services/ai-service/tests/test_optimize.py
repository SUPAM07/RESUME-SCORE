"""Tests for the optimize service (tailor, text-import, bullet improvement)."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import Settings
from app.models.requests import (
    ImproveExperienceRequest,
    ImproveProjectRequest,
    ResumeData,
    TextImportRequest,
    WorkExperience,
)
from app.services.optimize_service import (
    import_from_text,
    improve_experience_bullet,
    improve_project_bullet,
    tailor_resume,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def settings() -> Settings:
    return Settings(
        jwt_secret="test-secret",
        openai_api_key="sk-test",
        anthropic_api_key="",
        openrouter_api_key="",
    )


@pytest.fixture
def sample_resume() -> ResumeData:
    return ResumeData(
        first_name="Jane",
        last_name="Doe",
        email="jane@example.com",
        work_experience=[
            WorkExperience(
                position="Software Engineer",
                company="Acme Corp",
                start_date="2022-01",
                end_date="2024-01",
                responsibilities=[
                    "Built REST APIs using Python and FastAPI",
                    "Improved database query performance by 30%",
                ],
            )
        ],
    )


# ---------------------------------------------------------------------------
# tailor_resume
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tailor_resume_returns_dict(
    settings: Settings, sample_resume: ResumeData
) -> None:
    """tailor_resume should call complete_json and return the parsed dict."""
    expected: dict[str, Any] = {"first_name": "Jane", "work_experience": []}

    with patch(
        "app.services.optimize_service.complete_json",
        new_callable=AsyncMock,
        return_value=expected,
    ) as mock_complete:
        result = await tailor_resume(
            resume=sample_resume,
            job_description="We need a Python backend engineer...",
            job_title="Senior Backend Engineer",
            company_name="TechCorp",
            model="gpt-4o-mini",
            provider="openai",
            settings=settings,
        )

    assert result == expected
    mock_complete.assert_awaited_once()
    # Verify the messages contain the job description
    call_messages = mock_complete.call_args[0][0]
    user_message = call_messages[-1]["content"]
    assert "Python backend engineer" in user_message
    assert "TechCorp" in user_message


@pytest.mark.asyncio
async def test_tailor_resume_includes_resume_json(
    settings: Settings, sample_resume: ResumeData
) -> None:
    """tailor_resume user message should contain serialised resume data."""
    with patch(
        "app.services.optimize_service.complete_json",
        new_callable=AsyncMock,
        return_value={},
    ) as mock_complete:
        await tailor_resume(
            resume=sample_resume,
            job_description="Need a backend engineer",
            job_title="Backend Engineer",
            company_name="StartupX",
            model="gpt-4o-mini",
            provider="openai",
            settings=settings,
        )

    messages = mock_complete.call_args[0][0]
    user_content = messages[-1]["content"]
    assert "jane@example.com" in user_content


# ---------------------------------------------------------------------------
# import_from_text
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_import_from_text_returns_dict(settings: Settings) -> None:
    """import_from_text should return parsed dict from complete_json."""
    expected: dict[str, Any] = {"first_name": "John", "skills": []}

    with patch(
        "app.services.optimize_service.complete_json",
        new_callable=AsyncMock,
        return_value=expected,
    ):
        result = await import_from_text(
            text="John Smith, Software Engineer at Google...",
            model="gpt-4o-mini",
            provider="openai",
            settings=settings,
        )

    assert result == expected


@pytest.mark.asyncio
async def test_import_from_text_passes_text_in_message(settings: Settings) -> None:
    """import_from_text should include the raw text in the user message."""
    raw_text = "Alice Johnson — Python Developer — alice@test.com"

    with patch(
        "app.services.optimize_service.complete_json",
        new_callable=AsyncMock,
        return_value={},
    ) as mock_complete:
        await import_from_text(
            text=raw_text,
            model="gpt-4o-mini",
            provider="openai",
            settings=settings,
        )

    messages = mock_complete.call_args[0][0]
    assert any(raw_text in m["content"] for m in messages if m["role"] == "user")


# ---------------------------------------------------------------------------
# improve_experience_bullet
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_improve_experience_bullet_strips_whitespace(
    settings: Settings,
) -> None:
    """improve_experience_bullet should strip leading/trailing whitespace."""
    with patch(
        "app.services.optimize_service.complete",
        new_callable=AsyncMock,
        return_value="  **Led** team of **5** engineers, delivering **20%** faster releases  ",
    ):
        request = ImproveExperienceRequest(
            bullet="Led the team",
            position="Engineering Manager",
        )
        result = await improve_experience_bullet(request, settings)

    assert result == "**Led** team of **5** engineers, delivering **20%** faster releases"


@pytest.mark.asyncio
async def test_improve_experience_bullet_includes_context(
    settings: Settings,
) -> None:
    """improve_experience_bullet should embed position/company context in the message."""
    with patch(
        "app.services.optimize_service.complete",
        new_callable=AsyncMock,
        return_value="improved bullet",
    ) as mock_complete:
        request = ImproveExperienceRequest(
            bullet="Wrote code",
            position="Senior Developer",
            company="Acme",
            job_description="Looking for Python expertise",
        )
        await improve_experience_bullet(request, settings)

    messages = mock_complete.call_args[0][0]
    user_content = next(m["content"] for m in messages if m["role"] == "user")
    assert "Senior Developer" in user_content
    assert "Acme" in user_content
    assert "Python expertise" in user_content


# ---------------------------------------------------------------------------
# improve_project_bullet
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_improve_project_bullet_returns_stripped_text(
    settings: Settings,
) -> None:
    """improve_project_bullet should return the AI response stripped of whitespace."""
    with patch(
        "app.services.optimize_service.complete",
        new_callable=AsyncMock,
        return_value="\n**Built** scalable **REST API** using **FastAPI**\n",
    ):
        request = ImproveProjectRequest(
            bullet="Built an API",
            project_name="MyApp",
        )
        result = await improve_project_bullet(request, settings)

    assert result == "**Built** scalable **REST API** using **FastAPI**"


@pytest.mark.asyncio
async def test_improve_project_bullet_includes_job_description(
    settings: Settings,
) -> None:
    """improve_project_bullet embeds the target job description when provided."""
    with patch(
        "app.services.optimize_service.complete",
        new_callable=AsyncMock,
        return_value="improved",
    ) as mock_complete:
        request = ImproveProjectRequest(
            bullet="Created a dashboard",
            project_name="Analytics Tool",
            job_description="Requires React and D3.js skills",
        )
        await improve_project_bullet(request, settings)

    messages = mock_complete.call_args[0][0]
    user_content = next(m["content"] for m in messages if m["role"] == "user")
    assert "React and D3.js" in user_content
