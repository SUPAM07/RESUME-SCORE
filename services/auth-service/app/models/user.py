"""Pydantic models for user authentication and profiles.

These mirror the Supabase `profiles` table and the shared TypeScript contracts.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field, model_validator


# ---------------------------------------------------------------------------
# Resume content section models (mirror shared/types/index.ts)
# ---------------------------------------------------------------------------


class WorkExperience(BaseModel):
    position: str
    company: str
    location: str | None = None
    date: str
    description: list[str] = Field(default_factory=list)
    technologies: list[str] | None = None


class Education(BaseModel):
    school: str
    degree: str
    field: str
    location: str | None = None
    date: str
    gpa: float | str | None = None
    achievements: list[str] | None = None


class Project(BaseModel):
    name: str
    description: list[str] = Field(default_factory=list)
    date: str | None = None
    technologies: list[str] | None = None
    url: str | None = None
    github_url: str | None = None


class Skill(BaseModel):
    category: str
    items: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------


class Profile(BaseModel):
    """Mirrors the public.profiles table row."""

    user_id: str
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone_number: str | None = None
    location: str | None = None
    website: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    is_admin: bool = False
    work_experience: list[WorkExperience] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    skills: list[Skill] = Field(default_factory=list)
    projects: list[Project] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ProfileUpdate(BaseModel):
    """Partial update payload for PUT /profile."""

    first_name: str | None = None
    last_name: str | None = None
    email: EmailStr | None = None
    phone_number: str | None = None
    location: str | None = None
    website: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    work_experience: list[WorkExperience] | None = None
    education: list[Education] | None = None
    skills: list[Skill] | None = None
    projects: list[Project] | None = None

    @model_validator(mode="before")
    @classmethod
    def at_least_one_field(cls, values: dict[str, Any]) -> dict[str, Any]:
        provided = {k: v for k, v in values.items() if v is not None}
        if not provided:
            raise ValueError("At least one field must be provided for update")
        return values


# ---------------------------------------------------------------------------
# Auth request/response models
# ---------------------------------------------------------------------------


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class VerifyTokenRequest(BaseModel):
    token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class UserResponse(BaseModel):
    """Authenticated user details returned by /auth/me."""

    id: str
    email: str
    email_confirmed: bool = False
    created_at: datetime | None = None


class VerifyTokenResponse(BaseModel):
    user_id: str
    email: str
    expires_at: str
    subscription_plan: str = "free"
