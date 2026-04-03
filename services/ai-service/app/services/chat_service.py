"""Chat service — streaming chat with resume context."""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator

from app.config import Settings
from app.models.requests import ChatStreamRequest, ResumeData
from app.services.ai_client import Message, stream_completion
from app.utils.logger import get_logger
from app.utils.prompts import AI_ASSISTANT_SYSTEM_PROMPT

logger = get_logger(__name__)


def _build_resume_context(resume: ResumeData | None, job_description: str | None) -> str:
    """Serialize resume and optional job description into a context block."""
    parts: list[str] = []

    if resume:
        parts.append("=== CURRENT RESUME ===")
        parts.append(json.dumps(resume.model_dump(), indent=2))

    if job_description:
        parts.append("\n=== TARGET JOB DESCRIPTION ===")
        parts.append(job_description)

    return "\n".join(parts)


def _build_messages(request: ChatStreamRequest) -> list[Message]:
    """Compose the full message list, injecting resume context into the system prompt."""
    context = _build_resume_context(request.resume, request.job_description)

    system_content = AI_ASSISTANT_SYSTEM_PROMPT
    if context:
        system_content = f"{AI_ASSISTANT_SYSTEM_PROMPT}\n\n{context}"

    messages: list[Message] = [{"role": "system", "content": system_content}]
    messages.extend({"role": m.role, "content": m.content} for m in request.messages)
    return messages


async def stream_chat(
    request: ChatStreamRequest,
    settings: Settings,
) -> AsyncGenerator[str, None]:
    """Yield raw text tokens from the AI provider as SSE data payloads."""
    messages = _build_messages(request)

    logger.info(
        "chat_stream_start",
        provider=request.provider,
        model=request.model,
        message_count=len(request.messages),
    )

    async for token in stream_completion(
        messages=messages,
        model=request.model,
        provider=request.provider,
        settings=settings,
        max_tokens=request.max_tokens,
    ):
        yield token
