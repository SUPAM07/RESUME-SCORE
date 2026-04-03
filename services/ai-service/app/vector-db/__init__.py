# Vector Database client for semantic resume search
# Supports Pinecone and Qdrant backends

from typing import Optional
import os


VECTOR_DB_PROVIDER = os.environ.get("VECTOR_DB_PROVIDER", "qdrant")
EMBEDDING_DIM = 1536  # text-embedding-3-small dimensions


class VectorDBClient:
    """Unified interface for vector database operations."""

    def __init__(self, provider: str = VECTOR_DB_PROVIDER):
        if provider not in ("qdrant", "pinecone"):
            raise ValueError(f"Unsupported vector DB provider: {provider}")
        self.provider = provider
        self._client = self._init_client()

    def _init_client(self):
        try:
            if self.provider == "qdrant":
                from qdrant_client import QdrantClient
                url = os.environ.get("QDRANT_URL", "http://qdrant:6333")
                return QdrantClient(url=url)
            elif self.provider == "pinecone":
                from pinecone import Pinecone
                api_key = os.environ.get("PINECONE_API_KEY")
                if not api_key:
                    raise ValueError("PINECONE_API_KEY environment variable is not set")
                pc = Pinecone(api_key=api_key)
                return pc.Index(os.environ.get("PINECONE_INDEX", "resume-score"))
        except Exception as e:
            raise RuntimeError(f"Failed to initialize {self.provider} client: {str(e)}")

    async def upsert(self, id: str, vector: list[float], metadata: dict) -> None:
        """Store a vector embedding with metadata."""
        if not isinstance(id, str) or not id.strip():
            raise ValueError("ID must be a non-empty string")
        if not isinstance(vector, list) or len(vector) != EMBEDDING_DIM:
            raise ValueError(f"Vector must be a list of {EMBEDDING_DIM} floats")
        if not isinstance(metadata, dict):
            raise ValueError("Metadata must be a dictionary")

        try:
            if self.provider == "qdrant":
                from qdrant_client.models import PointStruct
                self._client.upsert(
                    collection_name="resumes",
                    points=[PointStruct(id=id, vector=vector, payload=metadata)],
                )
            elif self.provider == "pinecone":
                self._client.upsert(vectors=[(id, vector, metadata)])
        except Exception as e:
            raise RuntimeError(f"Failed to upsert vector: {str(e)}")

    async def search(
        self,
        query_vector: list[float],
        top_k: int = 10,
        filter_metadata: Optional[dict] = None,
    ) -> list[dict]:
        """Find the most similar vectors."""
        if not isinstance(query_vector, list) or len(query_vector) != EMBEDDING_DIM:
            raise ValueError(f"Query vector must be a list of {EMBEDDING_DIM} floats")
        if not isinstance(top_k, int) or top_k <= 0:
            raise ValueError("top_k must be a positive integer")

        try:
            if self.provider == "qdrant":
                results = self._client.search(
                    collection_name="resumes",
                    query_vector=query_vector,
                    limit=top_k,
                    query_filter=filter_metadata,
                )
                return [{"id": str(r.id), "score": r.score, "metadata": r.payload} for r in results]
            elif self.provider == "pinecone":
                results = self._client.query(
                    vector=query_vector,
                    top_k=top_k,
                    filter=filter_metadata,
                )
                return [
                    {"id": str(m["id"]), "score": m["score"], "metadata": m.get("metadata", {})}
                    for m in results.get("matches", [])
                ]
        except Exception as e:
            raise RuntimeError(f"Failed to search vectors: {str(e)}")

    async def delete(self, id: str) -> None:
        """Remove a vector by ID."""
        if not isinstance(id, str) or not id.strip():
            raise ValueError("ID must be a non-empty string")

        try:
            if self.provider == "qdrant":
                from qdrant_client.models import PointIdsList
                self._client.delete(
                    collection_name="resumes",
                    points_selector=PointIdsList(points=[id]),
                )
            elif self.provider == "pinecone":
                self._client.delete(ids=[id])
        except Exception as e:
            raise RuntimeError(f"Failed to delete vector: {str(e)}")
