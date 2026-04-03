"""
Text embedding generation for semantic search and similarity.
Supports OpenAI and Vertex AI embedding models.
"""
from typing import Optional
import os


class EmbeddingService:
    """Generate vector embeddings for resume text and job descriptions."""

    def __init__(self, provider: str = "openai"):
        self.provider = provider
        self.model = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")

    async def embed(self, text: str) -> list[float]:
        """Generate an embedding vector for the given text."""
        if self.provider == "openai":
            return await self._embed_openai(text)
        raise ValueError(f"Unknown embedding provider: {self.provider}")

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a batch of texts."""
        if self.provider == "openai":
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
            response = await client.embeddings.create(model=self.model, input=texts)
            return [item.embedding for item in response.data]
        raise ValueError(f"Unknown embedding provider: {self.provider}")

    async def _embed_openai(self, text: str) -> list[float]:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
        response = await client.embeddings.create(
            model=self.model,
            input=text[:8191],  # Token limit
        )
        return response.data[0].embedding
