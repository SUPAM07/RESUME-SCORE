import os
import logging
import json
from typing import Any

from celery import Task
from openai import OpenAI
from anthropic import Anthropic

from .celery_app import celery_app

logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
AI_PROVIDER = os.getenv("AI_PROVIDER", "openai")


def _get_openai_client() -> OpenAI:
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return OpenAI(api_key=OPENAI_API_KEY)


def _get_anthropic_client() -> Anthropic:
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    return Anthropic(api_key=ANTHROPIC_API_KEY)


def _call_ai(prompt: str, system_prompt: str = "") -> str:
    if AI_PROVIDER == "anthropic" and ANTHROPIC_API_KEY:
        client = _get_anthropic_client()
        # Instruct model to return only JSON so json.loads succeeds downstream
        json_system = (system_prompt or "You are an expert resume writer and career coach.") + (
            " Respond with valid JSON only. Do not include markdown fences or any text outside the JSON object."
        )
        message = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=4096,
            system=json_system,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text
    else:
        client = _get_openai_client()
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        else:
            messages.append(
                {"role": "system", "content": "You are an expert resume writer and career coach."}
            )
        messages.append({"role": "user", "content": prompt})
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            max_tokens=4096,
            response_format={"type": "json_object"},
        )
        return response.choices[0].message.content or "{}"


class BaseAITask(Task):
    abstract = True

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        logger.error("Task %s failed: %s", task_id, exc)


@celery_app.task(bind=True, base=BaseAITask, name="app.tasks.generate_resume_task")
def generate_resume_task(
    self,
    user_id: str,
    job_title: str | None,
    job_description: str | None,
    existing_resume: dict[str, Any] | None,
    instructions: str | None,
) -> dict[str, Any]:
    self.update_state(state="PROGRESS", meta={"progress": 10, "status": "Analyzing requirements"})

    system_prompt = (
        "You are an expert resume writer specializing in ATS-optimized resumes. "
        "Always return valid JSON matching the requested schema."
    )

    resume_context = ""
    if existing_resume:
        resume_context = f"\nExisting resume data:\n{json.dumps(existing_resume, indent=2)}"

    prompt = f"""Generate a professional resume for the following:
Job Title: {job_title or 'Not specified'}
Job Description: {job_description or 'Not specified'}
{resume_context}
Additional Instructions: {instructions or 'None'}

Return a JSON object with these fields:
- personal_info: {{full_name, email, phone, location, linkedin, github, website}}
- work_experience: [{{position, company, location, start_date, end_date, description, responsibilities: []}}]
- education: [{{degree, institution, location, graduation_date, gpa, achievements: []}}]
- skills: [{{category, skills: []}}]
- summary: string"""

    self.update_state(state="PROGRESS", meta={"progress": 40, "status": "Generating content"})

    result_text = _call_ai(prompt, system_prompt)

    self.update_state(state="PROGRESS", meta={"progress": 80, "status": "Finalizing resume"})

    try:
        result = json.loads(result_text)
    except json.JSONDecodeError:
        result = {"raw_content": result_text}

    return {"status": "completed", "resume": result}


@celery_app.task(bind=True, base=BaseAITask, name="app.tasks.tailor_resume_task")
def tailor_resume_task(
    self,
    user_id: str,
    resume: dict[str, Any],
    job_description: str,
    job_title: str | None,
    instructions: str | None,
) -> dict[str, Any]:
    self.update_state(state="PROGRESS", meta={"progress": 10, "status": "Analyzing job description"})

    system_prompt = (
        "You are an expert resume writer specializing in tailoring resumes to specific job descriptions "
        "for maximum ATS compatibility. Always return valid JSON."
    )

    prompt = f"""Tailor the following resume for this job opportunity:

Job Title: {job_title or 'Not specified'}
Job Description:
{job_description}

Current Resume:
{json.dumps(resume, indent=2)}

Additional Instructions: {instructions or 'None'}

Return a JSON object with the tailored resume maintaining the same structure as the input resume.
Focus on:
1. Highlighting relevant experience and skills
2. Using keywords from the job description
3. Quantifying achievements where possible
4. Ensuring ATS compatibility"""

    self.update_state(state="PROGRESS", meta={"progress": 40, "status": "Tailoring content"})

    result_text = _call_ai(prompt, system_prompt)

    self.update_state(state="PROGRESS", meta={"progress": 80, "status": "Finalizing tailored resume"})

    try:
        result = json.loads(result_text)
    except json.JSONDecodeError:
        result = {"raw_content": result_text}

    return {"status": "completed", "resume": result}


@celery_app.task(bind=True, base=BaseAITask, name="app.tasks.score_resume_task")
def score_resume_task(
    self,
    resume: dict[str, Any],
    job_description: str,
    job_title: str | None,
) -> dict[str, Any]:
    self.update_state(state="PROGRESS", meta={"progress": 20, "status": "Analyzing resume"})

    system_prompt = (
        "You are an ATS (Applicant Tracking System) expert. "
        "Analyze resumes and return detailed scoring. Always return valid JSON."
    )

    prompt = f"""Score this resume against the job description:

Job Title: {job_title or 'Not specified'}
Job Description:
{job_description}

Resume:
{json.dumps(resume, indent=2)}

Return a JSON object with:
- overall_score: integer 0-100
- keyword_match: integer 0-100
- format_score: integer 0-100  
- experience_relevance: integer 0-100
- suggestions: array of strings with specific improvement recommendations"""

    self.update_state(state="PROGRESS", meta={"progress": 60, "status": "Scoring resume"})

    result_text = _call_ai(prompt, system_prompt)

    try:
        result = json.loads(result_text)
    except json.JSONDecodeError:
        result = {
            "overall_score": 0,
            "keyword_match": 0,
            "format_score": 0,
            "experience_relevance": 0,
            "suggestions": ["Unable to parse AI response"],
        }

    return {"status": "completed", "score": result}
