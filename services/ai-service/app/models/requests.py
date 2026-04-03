"""Pydantic request models for all AI endpoints."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Shared resume schema models
# ---------------------------------------------------------------------------


class WorkExperience(BaseModel):
    position: str = ""
    company: str = ""
    location: str = ""
    start_date: str = ""
    end_date: str = ""
    description: str = ""
    responsibilities: list[str] = Field(default_factory=list)


class Education(BaseModel):
    degree: str = ""
    institution: str = ""
    location: str = ""
    graduation_date: str = ""
    gpa: str = ""
    achievements: list[str] = Field(default_factory=list)


class Skill(BaseModel):
    category: str = ""
    skills: list[str] = Field(default_factory=list)


class Project(BaseModel):
    name: str = ""
    description: str = ""
    technologies: list[str] = Field(default_factory=list)
    url: str = ""
    github_url: str = ""
    date: str = ""
    highlights: list[str] = Field(default_factory=list)


class Certification(BaseModel):
    name: str = ""
    issuer: str = ""
    date: str = ""
    url: str = ""


class ResumeData(BaseModel):
    first_name: str = ""
    last_name: str = ""
    email: str = ""
    phone_number: str = ""
    location: str = ""
    website: str = ""
    linkedin_url: str = ""
    github_url: str = ""
    professional_summary: str = ""
    work_experience: list[WorkExperience] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    skills: list[Skill] = Field(default_factory=list)
    projects: list[Project] = Field(default_factory=list)
    certifications: list[Certification] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str


class ChatStreamRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1)
    resume: ResumeData | None = None
    job_description: str | None = None
    model: str = "gpt-4o-mini"
    provider: str = Field(
        default="openai",
        pattern="^(openai|anthropic|openrouter)$",
    )
    max_tokens: int = Field(default=2048, ge=1, le=8192)


# ---------------------------------------------------------------------------
# Optimize — tailor
# ---------------------------------------------------------------------------


class TailorResumeRequest(BaseModel):
    resume: ResumeData
    job_description: str = Field(..., min_length=10)
    job_title: str = ""
    company_name: str = ""
    model: str = "gpt-4o-mini"
    provider: str = Field(
        default="openai",
        pattern="^(openai|anthropic|openrouter)$",
    )


# ---------------------------------------------------------------------------
# Optimize — text import
# ---------------------------------------------------------------------------


class TextImportRequest(BaseModel):
    text: str = Field(..., min_length=10)
    model: str = "gpt-4o-mini"
    provider: str = Field(
        default="openai",
        pattern="^(openai|anthropic|openrouter)$",
    )


# ---------------------------------------------------------------------------
# Optimize — improve experience bullet
# ---------------------------------------------------------------------------


class ImproveExperienceRequest(BaseModel):
    bullet: str = Field(..., min_length=5)
    position: str = ""
    company: str = ""
    job_description: str = ""
    model: str = "gpt-4o-mini"
    provider: str = Field(
        default="openai",
        pattern="^(openai|anthropic|openrouter)$",
    )


# ---------------------------------------------------------------------------
# Optimize — improve project bullet
# ---------------------------------------------------------------------------


class ImproveProjectRequest(BaseModel):
    bullet: str = Field(..., min_length=5)
    project_name: str = ""
    job_description: str = ""
    model: str = "gpt-4o-mini"
    provider: str = Field(
        default="openai",
        pattern="^(openai|anthropic|openrouter)$",
    )


# ---------------------------------------------------------------------------
# Score — ATS
# ---------------------------------------------------------------------------


class ATSScoreRequest(BaseModel):
    resume: ResumeData
    job_description: str = Field(..., min_length=10)
    model: str = "gpt-4o-mini"
    provider: str = Field(
        default="openai",
        pattern="^(openai|anthropic|openrouter)$",
    )


# ---------------------------------------------------------------------------
# Score — full resume
# ---------------------------------------------------------------------------


class ResumeScoreRequest(BaseModel):
    resume: ResumeData
    job_description: str | None = None
    model: str = "gpt-4o-mini"
    provider: str = Field(
        default="openai",
        pattern="^(openai|anthropic|openrouter)$",
    )


# ---------------------------------------------------------------------------
# Cover letter
# ---------------------------------------------------------------------------


class CoverLetterRequest(BaseModel):
    resume: ResumeData
    job_description: str = Field(..., min_length=10)
    job_title: str = ""
    company_name: str = ""
    tone: str = Field(
        default="professional",
        pattern="^(professional|enthusiastic|concise)$",
    )
    model: str = "gpt-4o-mini"
    provider: str = Field(
        default="openai",
        pattern="^(openai|anthropic|openrouter)$",
    )
