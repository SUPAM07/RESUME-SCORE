"""
AI Analysis and Scoring Pipelines.
Each pipeline orchestrates LLM calls, validation, and persistence.
"""
from dataclasses import dataclass
from typing import Optional
import asyncio

from ..llm import get_llm_client, BaseLLMClient


@dataclass
class AnalysisPipelineInput:
    resume_id: str
    user_id: str
    resume_text: str
    job_description: Optional[str] = None
    job_id: Optional[str] = None
    target_role: Optional[str] = None
    model_preference: str = "gemini"


@dataclass
class ScoringPipelineInput:
    resume_id: str
    user_id: str
    job_id: str
    resume_text: str
    job_description: str
    job_title: str
    required_skills: list[str]
    model_preference: str = "gemini"


class AnalysisPipeline:
    """Full resume analysis pipeline — runs comprehensive scoring and feedback."""

    def __init__(self, llm_client: Optional[BaseLLMClient] = None):
        self.llm_client = llm_client or get_llm_client("gemini")

    async def run(self, input_data: AnalysisPipelineInput) -> dict:
        SYSTEM_PROMPT = """You are an expert resume coach and ATS specialist.
        Analyze resumes with precision, honesty, and actionable feedback.
        Always respond with valid JSON."""

        user_prompt = f"""Analyze this resume{' against the job description' if input_data.job_description else ''}.

Resume:
{input_data.resume_text}

{f'Job Description:{chr(10)}{input_data.job_description}' if input_data.job_description else ''}
{f'Target Role: {input_data.target_role}' if input_data.target_role else ''}

Provide: overall score (0-100), section scores, strengths, weaknesses, suggestions, keywords.
Return ONLY valid JSON matching the AiAnalysisResult schema."""

        result = await self.llm_client.complete_json(SYSTEM_PROMPT, user_prompt)
        result["resumeId"] = input_data.resume_id
        result["userId"] = input_data.user_id
        if input_data.job_id:
            result["jobId"] = input_data.job_id
        return result


class ScoringPipeline:
    """Quick job-match scoring pipeline — fast assessment against a specific job."""

    def __init__(self, llm_client: Optional[BaseLLMClient] = None):
        self.llm_client = llm_client or get_llm_client("gemini")

    async def run(self, input_data: ScoringPipelineInput) -> dict:
        SYSTEM_PROMPT = """You are an expert technical recruiter.
        Score resumes against job postings with strict, honest assessments.
        Always respond with valid JSON."""

        user_prompt = f"""Score this resume for the {input_data.job_title} role.

Resume:
{input_data.resume_text}

Job Description: {input_data.job_description}
Required Skills: {', '.join(input_data.required_skills)}

Return ONLY valid JSON with: score, qualified, matchPercentage, recommendation, matchedRequirements, missingRequirements, feedback."""

        result = await self.llm_client.complete_json(SYSTEM_PROMPT, user_prompt)
        result["resumeId"] = input_data.resume_id
        result["userId"] = input_data.user_id
        result["jobId"] = input_data.job_id
        return result
