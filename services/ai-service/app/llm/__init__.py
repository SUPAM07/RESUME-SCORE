"""
LLM Client wrappers for Gemini, OpenAI, and Anthropic.
Provides a unified interface for all AI providers.
"""
from abc import ABC, abstractmethod
from typing import Any

import google.generativeai as genai
from openai import AsyncOpenAI
from anthropic import AsyncAnthropic

from ..config import settings


class BaseLLMClient(ABC):
    """Abstract base class for all LLM clients."""

    @abstractmethod
    async def complete(self, system_prompt: str, user_prompt: str, **kwargs: Any) -> str:
        """Generate a completion given system and user prompts."""
        ...

    @abstractmethod
    async def complete_json(self, system_prompt: str, user_prompt: str, **kwargs: Any) -> dict:
        """Generate a JSON-structured completion."""
        ...


class GeminiClient(BaseLLMClient):
    """Google Gemini API client."""

    def __init__(self, model: str = "gemini-2.0-flash-exp"):
        genai.configure(api_key=settings.gemini_api_key)
        self.model = genai.GenerativeModel(
            model,
            generation_config=genai.GenerationConfig(
                temperature=0.3,
                max_output_tokens=8192,
            ),
        )
        self.model_name = model

    async def complete(self, system_prompt: str, user_prompt: str, **kwargs: Any) -> str:
        response = await self.model.generate_content_async(
            f"{system_prompt}\n\n{user_prompt}",
            **kwargs,
        )
        return response.text

    async def complete_json(self, system_prompt: str, user_prompt: str, **kwargs: Any) -> dict:
        import json
        text = await self.complete(system_prompt, user_prompt, **kwargs)
        # Strip markdown code fences if present
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return json.loads(text.strip())


class OpenAIClient(BaseLLMClient):
    """OpenAI API client."""

    def __init__(self, model: str = "gpt-4o"):
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = model

    async def complete(self, system_prompt: str, user_prompt: str, **kwargs: Any) -> str:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=kwargs.get("temperature", 0.3),
            max_tokens=kwargs.get("max_tokens", 4096),
        )
        return response.choices[0].message.content or ""

    async def complete_json(self, system_prompt: str, user_prompt: str, **kwargs: Any) -> dict:
        import json
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        return json.loads(response.choices[0].message.content or "{}")


class AnthropicClient(BaseLLMClient):
    """Anthropic Claude API client."""

    def __init__(self, model: str = "claude-3-5-sonnet-20241022"):
        self.client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        self.model = model

    async def complete(self, system_prompt: str, user_prompt: str, **kwargs: Any) -> str:
        response = await self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return response.content[0].text  # type: ignore

    async def complete_json(self, system_prompt: str, user_prompt: str, **kwargs: Any) -> dict:
        import json
        text = await self.complete(
            system_prompt + "\n\nYou must respond with valid JSON only.",
            user_prompt,
            **kwargs,
        )
        return json.loads(text.strip())


def get_llm_client(provider: str = "gemini") -> BaseLLMClient:
    """Factory function for LLM clients."""
    clients = {
        "gemini": GeminiClient,
        "openai": OpenAIClient,
        "anthropic": AnthropicClient,
    }
    cls = clients.get(provider)
    if cls is None:
        raise ValueError(f"Unknown LLM provider: {provider}. Choose from: {list(clients.keys())}")
    return cls()
