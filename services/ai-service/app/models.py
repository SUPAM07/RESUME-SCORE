from pydantic import BaseModel, Field
from typing import Optional, Any


class GenerateResumeRequest(BaseModel):
    user_id: str
    job_title: Optional[str] = None
    job_description: Optional[str] = None
    existing_resume: Optional[dict[str, Any]] = None
    instructions: Optional[str] = Field(None, max_length=2000)


class TailorResumeRequest(BaseModel):
    user_id: str
    resume: dict[str, Any]
    job_description: str = Field(..., min_length=10)
    job_title: Optional[str] = None
    instructions: Optional[str] = Field(None, max_length=2000)


class ScoreResumeRequest(BaseModel):
    resume: dict[str, Any]
    job_description: str = Field(..., min_length=10)
    job_title: Optional[str] = None


class TaskResponse(BaseModel):
    task_id: str
    status: str
    message: str = ""


class TaskStatusResponse(BaseModel):
    task_id: str
    status: str
    result: Optional[Any] = None
    error: Optional[str] = None


class ScoreResponse(BaseModel):
    overall_score: int = Field(..., ge=0, le=100)
    keyword_match: int = Field(..., ge=0, le=100)
    format_score: int = Field(..., ge=0, le=100)
    experience_relevance: int = Field(..., ge=0, le=100)
    suggestions: list[str] = []
