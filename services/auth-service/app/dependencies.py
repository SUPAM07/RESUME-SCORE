"""Shared FastAPI dependencies: database pool, Redis client, auth extraction."""

from __future__ import annotations

import uuid
from typing import Annotated

import redis.asyncio as aioredis
from fastapi import Depends, Header, Request
from jose import JWTError, jwt
from supabase import AsyncClient, acreate_client

from app.config import Settings, get_settings
from app.utils.exceptions import AuthenticationError
from app.utils.logger import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Supabase async client
# ---------------------------------------------------------------------------


async def get_supabase_client(
    settings: Annotated[Settings, Depends(get_settings)],
) -> AsyncClient:
    """Yield a per-request Supabase async client using the service-role key.

    The service-role key bypasses RLS so the service can query any row.
    Auth checks are enforced at the application layer instead.
    """
    client: AsyncClient = await acreate_client(
        settings.supabase_url,
        settings.supabase_service_key,
    )
    return client


# ---------------------------------------------------------------------------
# Redis async client
# ---------------------------------------------------------------------------

_redis_pool: aioredis.Redis | None = None


async def get_redis(
    settings: Annotated[Settings, Depends(get_settings)],
) -> aioredis.Redis:
    """Return the shared Redis connection (lazily initialised)."""
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_pool


# ---------------------------------------------------------------------------
# JWT / current user
# ---------------------------------------------------------------------------


async def get_current_user_id(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    """Extract and validate the Supabase JWT from the Authorization header.

    Returns the ``sub`` claim (user UUID) on success.
    Raises :class:`AuthenticationError` for any invalid token.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthenticationError("Missing or malformed Authorization header")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"verify_aud": False},
        )
    except JWTError as exc:
        logger.warning("jwt_decode_failed", error=str(exc))
        raise AuthenticationError("Invalid or expired token") from exc

    user_id: str | None = payload.get("sub")
    if not user_id:
        raise AuthenticationError("Token is missing subject claim")

    return user_id


# ---------------------------------------------------------------------------
# Request ID middleware helper
# ---------------------------------------------------------------------------


def inject_request_id(request: Request) -> str:
    """Attach a UUID request-ID to ``request.state`` and return it."""
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    return request_id


# ---------------------------------------------------------------------------
# Convenient type aliases for route signatures
# ---------------------------------------------------------------------------

CurrentUserID = Annotated[str, Depends(get_current_user_id)]
SupabaseClient = Annotated[AsyncClient, Depends(get_supabase_client)]
RedisClient = Annotated[aioredis.Redis, Depends(get_redis)]
AppSettings = Annotated[Settings, Depends(get_settings)]
