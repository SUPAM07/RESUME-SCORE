"""Multi-provider AI client with streaming support and fallback logic.

Supports OpenAI, Anthropic, and OpenRouter (for Gemini, DeepSeek, etc.).
"""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from typing import Any

import anthropic
import openai
from openai import AsyncOpenAI

from app.config import Settings
from app.utils.exceptions import AIProviderError, AllProvidersFailedError
from app.utils.logger import get_logger

logger = get_logger(__name__)

_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


# ---------------------------------------------------------------------------
# Provider-specific client factories
# ---------------------------------------------------------------------------


def _openai_client(settings: Settings) -> AsyncOpenAI:
    if not settings.openai_api_key:
        raise AIProviderError("openai", "API key not configured")
    return AsyncOpenAI(api_key=settings.openai_api_key)


def _openrouter_client(settings: Settings) -> AsyncOpenAI:
    if not settings.openrouter_api_key:
        raise AIProviderError("openrouter", "API key not configured")
    return AsyncOpenAI(
        api_key=settings.openrouter_api_key,
        base_url=_OPENROUTER_BASE_URL,
    )


def _anthropic_client(settings: Settings) -> anthropic.AsyncAnthropic:
    if not settings.anthropic_api_key:
        raise AIProviderError("anthropic", "API key not configured")
    return anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)


# ---------------------------------------------------------------------------
# Message helpers
# ---------------------------------------------------------------------------

Message = dict[str, str]


def _extract_system(messages: list[Message]) -> tuple[str, list[Message]]:
    """Separate the system message from the conversation for Anthropic."""
    system = ""
    conversation: list[Message] = []
    for msg in messages:
        if msg["role"] == "system":
            system = msg["content"]
        else:
            conversation.append(msg)
    return system, conversation


# ---------------------------------------------------------------------------
# Streaming completions
# ---------------------------------------------------------------------------


async def stream_openai(
    messages: list[Message],
    model: str,
    settings: Settings,
    max_tokens: int = 2048,
    base_url: str | None = None,
    api_key: str | None = None,
) -> AsyncGenerator[str, None]:
    """Stream tokens from an OpenAI-compatible endpoint."""
    client = AsyncOpenAI(
        api_key=api_key or settings.openai_api_key,
        base_url=base_url,
    )
    try:
        stream = await client.chat.completions.create(
            model=model,
            messages=messages,  # type: ignore[arg-type]
            max_tokens=max_tokens,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                yield delta
    except openai.APIError as exc:
        logger.error("openai_stream_error", error=str(exc), model=model)
        raise AIProviderError("openai", str(exc)) from exc


async def stream_anthropic(
    messages: list[Message],
    model: str,
    settings: Settings,
    max_tokens: int = 2048,
) -> AsyncGenerator[str, None]:
    """Stream tokens from the Anthropic API."""
    client = _anthropic_client(settings)
    system, conversation = _extract_system(messages)

    try:
        async with client.messages.stream(
            model=model,
            system=system,
            messages=conversation,  # type: ignore[arg-type]
            max_tokens=max_tokens,
        ) as stream:
            async for text in stream.text_stream:
                yield text
    except anthropic.APIError as exc:
        logger.error("anthropic_stream_error", error=str(exc), model=model)
        raise AIProviderError("anthropic", str(exc)) from exc


async def stream_openrouter(
    messages: list[Message],
    model: str,
    settings: Settings,
    max_tokens: int = 2048,
) -> AsyncGenerator[str, None]:
    """Stream tokens from OpenRouter."""
    async for token in stream_openai(
        messages=messages,
        model=model,
        settings=settings,
        max_tokens=max_tokens,
        base_url=_OPENROUTER_BASE_URL,
        api_key=settings.openrouter_api_key,
    ):
        yield token


async def stream_completion(
    messages: list[Message],
    model: str,
    provider: str,
    settings: Settings,
    max_tokens: int = 2048,
) -> AsyncGenerator[str, None]:
    """Route streaming to the correct provider."""
    if provider == "anthropic":
        async for token in stream_anthropic(messages, model, settings, max_tokens):
            yield token
    elif provider == "openrouter":
        async for token in stream_openrouter(messages, model, settings, max_tokens):
            yield token
    else:
        async for token in stream_openai(
            messages, model, settings, max_tokens
        ):
            yield token


# ---------------------------------------------------------------------------
# Non-streaming completions
# ---------------------------------------------------------------------------


async def complete_openai(
    messages: list[Message],
    model: str,
    settings: Settings,
    max_tokens: int = 4096,
    response_format: dict[str, str] | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
) -> str:
    """Get a non-streaming completion from an OpenAI-compatible endpoint."""
    client = AsyncOpenAI(
        api_key=api_key or settings.openai_api_key,
        base_url=base_url,
    )
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
    }
    if response_format:
        kwargs["response_format"] = response_format

    try:
        response = await client.chat.completions.create(**kwargs)
        return response.choices[0].message.content or ""
    except openai.APIError as exc:
        logger.error("openai_complete_error", error=str(exc), model=model)
        raise AIProviderError("openai", str(exc)) from exc


async def complete_anthropic(
    messages: list[Message],
    model: str,
    settings: Settings,
    max_tokens: int = 4096,
) -> str:
    """Get a non-streaming completion from the Anthropic API."""
    client = _anthropic_client(settings)
    system, conversation = _extract_system(messages)

    try:
        response = await client.messages.create(
            model=model,
            system=system,
            messages=conversation,  # type: ignore[arg-type]
            max_tokens=max_tokens,
        )
        block = response.content[0]
        return block.text if hasattr(block, "text") else ""
    except anthropic.APIError as exc:
        logger.error("anthropic_complete_error", error=str(exc), model=model)
        raise AIProviderError("anthropic", str(exc)) from exc


async def complete_openrouter(
    messages: list[Message],
    model: str,
    settings: Settings,
    max_tokens: int = 4096,
) -> str:
    """Get a non-streaming completion from OpenRouter."""
    return await complete_openai(
        messages=messages,
        model=model,
        settings=settings,
        max_tokens=max_tokens,
        base_url=_OPENROUTER_BASE_URL,
        api_key=settings.openrouter_api_key,
    )


async def complete(
    messages: list[Message],
    model: str,
    provider: str,
    settings: Settings,
    max_tokens: int = 4096,
    response_format: dict[str, str] | None = None,
) -> str:
    """Route a non-streaming completion to the correct provider."""
    if provider == "anthropic":
        return await complete_anthropic(messages, model, settings, max_tokens)
    if provider == "openrouter":
        return await complete_openrouter(messages, model, settings, max_tokens)
    return await complete_openai(
        messages, model, settings, max_tokens, response_format
    )


# ---------------------------------------------------------------------------
# JSON completions with fallback
# ---------------------------------------------------------------------------

_FALLBACK_CHAIN: list[tuple[str, str]] = [
    ("openai", "gpt-4o-mini"),
    ("openrouter", "deepseek/deepseek-v3.2:nitro"),
    ("anthropic", "claude-haiku-4-5"),
]


async def complete_json(
    messages: list[Message],
    model: str,
    provider: str,
    settings: Settings,
    max_tokens: int = 4096,
) -> dict[str, Any]:
    """Complete and parse a JSON response, with provider fallback."""
    providers_to_try: list[tuple[str, str]] = [(provider, model)] + [
        (p, m) for p, m in _FALLBACK_CHAIN if p != provider
    ]

    last_exc: Exception | None = None
    for try_provider, try_model in providers_to_try:
        # Skip providers with no configured API key
        if try_provider == "openai" and not settings.openai_api_key:
            continue
        if try_provider == "anthropic" and not settings.anthropic_api_key:
            continue
        if try_provider == "openrouter" and not settings.openrouter_api_key:
            continue

        try:
            rf = {"type": "json_object"} if try_provider != "anthropic" else None
            raw = await complete(
                messages, try_model, try_provider, settings, max_tokens, rf
            )
            # Extract JSON from markdown fences if present
            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0].strip()
            elif "```" in raw:
                raw = raw.split("```")[1].split("```")[0].strip()
            return json.loads(raw)
        except Exception as exc:
            logger.warning(
                "provider_attempt_failed",
                provider=try_provider,
                model=try_model,
                error=str(exc),
            )
            last_exc = exc
            continue

    raise AllProvidersFailedError() from last_exc
