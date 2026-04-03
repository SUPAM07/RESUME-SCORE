"""Pydantic response models for all AI endpoints."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Generic envelope
# ---------------------------------------------------------------------------


class SuccessResponse(BaseModel):
    success: bool = True
    data: Any = None


class ErrorDetail(BaseModel):
    code: str
    message: str
    status_code: int


class ErrorResponse(BaseModel):
    success: bool = False
    error: ErrorDetail


# ---------------------------------------------------------------------------
# Task (async Celery job)
# ---------------------------------------------------------------------------


class TaskCreatedResponse(BaseModel):
    success: bool = True
    task_id: str
    status: str = "pending"


class TaskStatusResponse(BaseModel):
    success: bool = True
    task_id: str
    status: str
    result: Any | None = None
    error: str | None = None
    progress: int | None = None


# ---------------------------------------------------------------------------
# Optimize — tailor
# ---------------------------------------------------------------------------


class TailorResumeResponse(BaseModel):
    success: bool = True
    task_id: str
    status: str = "pending"


# ---------------------------------------------------------------------------
# Optimize — text import
# ---------------------------------------------------------------------------


class TextImportResponse(BaseModel):
    success: bool = True
    resume: dict[str, Any]


# ---------------------------------------------------------------------------
# Optimize — improve bullet
# ---------------------------------------------------------------------------


class ImproveBulletResponse(BaseModel):
    success: bool = True
    improved_bullet: str
    original_bullet: str


# ---------------------------------------------------------------------------
# Score — ATS
# ---------------------------------------------------------------------------


class ATSScoreBreakdown(BaseModel):
    keyword_match: int = 0
    format_score: int = 0
    section_completeness: int = 0
    readability: int = 0


class ATSScoreResponse(BaseModel):
    success: bool = True
    overall_score: int
    breakdown: ATSScoreBreakdown
    matched_keywords: list[str] = []
    missing_keywords: list[str] = []
    recommendations: list[str] = []


# ---------------------------------------------------------------------------
# Score — full resume
# ---------------------------------------------------------------------------


class ResumeScoreCategory(BaseModel):
    score: int
    feedback: str
    suggestions: list[str] = []


class ResumeScoreResponse(BaseModel):
    success: bool = True
    overall_score: int
    impact: ResumeScoreCategory
    brevity: ResumeScoreCategory
    style: ResumeScoreCategory
    sections: ResumeScoreCategory
    skills: ResumeScoreCategory
    summary: str = ""


# ---------------------------------------------------------------------------
# Cover letter
# ---------------------------------------------------------------------------


class CoverLetterResponse(BaseModel):
    success: bool = True
    cover_letter: str
    word_count: int


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str
    version: str
    providers: dict[str, bool] = {}
