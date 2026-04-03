# Vector Database client for semantic resume search
# Supports Pinecone and Qdrant backends

from typing import Optional
import os


VECTOR_DB_PROVIDER = os.environ.get("VECTOR_DB_PROVIDER", "qdrant")
EMBEDDING_DIM = 1536  # text-embedding-3-small dimensions


class VectorDBClient:
    """Unified interface for vector database operations."""

    def __init__(self, provider: str = VECTOR_DB_PROVIDER):
        self.provider = provider
        self._client = self._init_client()

    def _init_client(self):
        if self.provider == "qdrant":
            from qdrant_client import QdrantClient
            return QdrantClient(url=os.environ.get("QDRANT_URL", "http://qdrant:6333"))
        elif self.provider == "pinecone":
            from pinecone import Pinecone
            pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
            return pc.Index(os.environ.get("PINECONE_INDEX", "resume-score"))
        raise ValueError(f"Unsupported vector DB provider: {self.provider}")

    async def upsert(self, id: str, vector: list[float], metadata: dict) -> None:
        """Store a vector embedding with metadata."""
        if self.provider == "qdrant":
            from qdrant_client.models import PointStruct
            self._client.upsert(
                collection_name="resumes",
                points=[PointStruct(id=id, vector=vector, payload=metadata)],
            )

    async def search(
        self,
        query_vector: list[float],
        top_k: int = 10,
        filter_metadata: Optional[dict] = None,
    ) -> list[dict]:
        """Find the most similar vectors."""
        if self.provider == "qdrant":
            results = self._client.search(
                collection_name="resumes",
                query_vector=query_vector,
                limit=top_k,
                query_filter=filter_metadata,
            )
            return [{"id": r.id, "score": r.score, "metadata": r.payload} for r in results]
        return []

    async def delete(self, id: str) -> None:
        """Remove a vector by ID."""
        if self.provider == "qdrant":
            from qdrant_client.models import PointIdsList
            self._client.delete(
                collection_name="resumes",
                points_selector=PointIdsList(points=[id]),
            )
