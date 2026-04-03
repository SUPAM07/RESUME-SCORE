import os
import logging
import json
import asyncio
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


def _validate_json_response(response_text: str) -> dict[str, Any]:
    """Validate and parse JSON response from AI provider."""
    if not isinstance(response_text, str):
        raise ValueError("Response must be a string")
    
    response_text = response_text.strip()
    if not response_text:
        raise ValueError("Response is empty")
    
    try:
        return json.loads(response_text)
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON from AI provider: {response_text[:200]}")
        raise ValueError(f"AI provider returned invalid JSON: {str(e)}")


def _call_ai(prompt: str, system_prompt: str = "") -> dict[str, Any]:
    """Call AI provider and return validated JSON response."""
    if not prompt or not isinstance(prompt, str):
        raise ValueError("Prompt must be a non-empty string")
    
    try:
        if AI_PROVIDER == "anthropic" and ANTHROPIC_API_KEY:
            client = _get_anthropic_client()
            json_system = (system_prompt or "You are an expert resume writer and career coach.") + (
                " Respond with valid JSON only. Do not include markdown fences or any text outside the JSON object."
            )
            message = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=4096,
                system=json_system,
                messages=[{"role": "user", "content": prompt}],
            )
            response_text = message.content[0].text if message.content else ""
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
            response_text = response.choices[0].message.content or "{}"
        
        # Validate response is valid JSON
        return _validate_json_response(response_text)
    except ValueError:
        # Re-raise validation errors
        raise
    except Exception as e:
        logger.error(f"AI provider error: {str(e)}")
        raise RuntimeError(f"AI provider error: {str(e)}")


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
    """Generate a resume using AI."""
    try:
        self.update_state(state="PROGRESS", meta={"progress": 10, "status": "Analyzing requirements"})

        system_prompt = (
            "You are an expert resume writer specializing in ATS-optimized resumes. "
            "Always return valid JSON matching the requested schema."
        )

        resume_context = ""
        if existing_resume:
            resume_context = f"\nExisting resume data:\n{json.dumps(existing_resume, indent=2)}"

        prompt = f"""Generate a professional resume for the following:\nJob Title: {job_title or 'Not specified'}\nJob Description: {job_description or 'Not specified'}\n{resume_context}\nAdditional Instructions: {instructions or 'None'}\n\nReturn ONLY valid JSON with the resume structure."""

        result = _call_ai(prompt, system_prompt)
        self.update_state(state="PROGRESS", meta={"progress": 100, "status": "Complete"})
        return result
    except Exception as exc:
        logger.error("generate_resume_task failed: %s", str(exc))
        raise
