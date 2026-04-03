"""Unit tests for profile routes and ProfileService."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# ── Set required env vars BEFORE importing the app ───────────────────────────
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "anon-key")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "service-key")
os.environ.setdefault("DATABASE_URL", "postgresql://localhost/test")
os.environ.setdefault("JWT_SECRET", "super-secret-jwt-key-for-testing-only")

from app.main import app  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.dependencies import get_supabase_client, get_redis  # noqa: E402
from app.models.user import Profile, ProfileUpdate  # noqa: E402
from app.services.profile_service import ProfileService  # noqa: E402

# ── Dependency overrides ──────────────────────────────────────────────────────

_mock_supabase = MagicMock()
_mock_redis = AsyncMock()
_mock_redis.ping = AsyncMock(return_value=True)

app.dependency_overrides[get_supabase_client] = lambda: _mock_supabase
app.dependency_overrides[get_redis] = lambda: _mock_redis

client = TestClient(app, raise_server_exceptions=False)
settings = get_settings()


# ---------------------------------------------------------------------------
# Helper: generate a valid JWT for test requests
# ---------------------------------------------------------------------------


def _make_bearer_token(user_id: str = "test-user-uuid") -> str:
    from jose import jwt

    payload = {
        "sub": user_id,
        "email": "testuser@example.com",
        "exp": int(
            (datetime.now(tz=timezone.utc) + timedelta(hours=1)).timestamp()
        ),
    }
    token = jwt.encode(
        payload, settings.jwt_secret, algorithm=settings.jwt_algorithm
    )
    return f"Bearer {token}"


def _make_profile(user_id: str = "test-user-uuid") -> Profile:
    return Profile(
        user_id=user_id,
        first_name="Jane",
        last_name="Doe",
        email="jane@example.com",
        phone_number="+1-555-0100",
        location="San Francisco, CA",
        website="https://janedoe.dev",
        linkedin_url="https://linkedin.com/in/janedoe",
        github_url="https://github.com/janedoe",
        work_experience=[],
        education=[],
        skills=[],
        projects=[],
        created_at=datetime.now(tz=timezone.utc),
        updated_at=datetime.now(tz=timezone.utc),
    )


# ---------------------------------------------------------------------------
# GET /profile
# ---------------------------------------------------------------------------


def test_get_profile_success():
    profile = _make_profile()

    with patch("app.routers.profile.ProfileService") as MockProfileService:
        mock_instance = AsyncMock()
        mock_instance.get_profile.return_value = profile
        MockProfileService.return_value = mock_instance

        resp = client.get(
            "/profile",
            headers={"Authorization": _make_bearer_token()},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["first_name"] == "Jane"
    assert body["data"]["email"] == "jane@example.com"


def test_get_profile_unauthenticated():
    resp = client.get("/profile")
    assert resp.status_code == 401


def test_get_profile_not_found():
    from app.utils.exceptions import NotFoundError

    with patch("app.routers.profile.ProfileService") as MockProfileService:
        mock_instance = AsyncMock()
        mock_instance.get_profile.side_effect = NotFoundError("Profile")
        MockProfileService.return_value = mock_instance

        resp = client.get(
            "/profile",
            headers={"Authorization": _make_bearer_token()},
        )

    assert resp.status_code == 404
    body = resp.json()
    assert body["error"]["code"] == "NOT_FOUND"


# ---------------------------------------------------------------------------
# PUT /profile
# ---------------------------------------------------------------------------


def test_update_profile_success():
    updated_profile = _make_profile()
    updated_profile.first_name = "Janet"

    with patch("app.routers.profile.ProfileService") as MockProfileService:
        mock_instance = AsyncMock()
        mock_instance.update_profile.return_value = updated_profile
        MockProfileService.return_value = mock_instance

        resp = client.put(
            "/profile",
            json={"first_name": "Janet"},
            headers={"Authorization": _make_bearer_token()},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["first_name"] == "Janet"


def test_update_profile_empty_body():
    """An empty update body should fail validation."""
    resp = client.put(
        "/profile",
        json={},
        headers={"Authorization": _make_bearer_token()},
    )

    assert resp.status_code == 422


def test_update_profile_unauthenticated():
    resp = client.put("/profile", json={"first_name": "Bob"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# ProfileService unit tests (no HTTP)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_profile_service_get_profile():
    mock_client = MagicMock()
    profile_row = {
        "user_id": "user-123",
        "first_name": "Alice",
        "last_name": "Smith",
        "email": "alice@example.com",
        "work_experience": [],
        "education": [],
        "skills": [],
        "projects": [],
    }

    # Build the async chain: client.table().select().eq().maybe_single().execute()
    execute_mock = AsyncMock(return_value=MagicMock(data=profile_row))
    chain = MagicMock()
    chain.execute = execute_mock
    chain.maybe_single.return_value = chain
    chain.eq.return_value = chain
    chain.select.return_value = chain
    mock_client.table.return_value = chain

    svc = ProfileService(mock_client)
    profile = await svc.get_profile("user-123")

    assert profile.first_name == "Alice"
    assert profile.user_id == "user-123"


@pytest.mark.asyncio
async def test_profile_service_get_profile_not_found():
    from app.utils.exceptions import NotFoundError

    mock_client = MagicMock()
    execute_mock = AsyncMock(return_value=MagicMock(data=None))
    chain = MagicMock()
    chain.execute = execute_mock
    chain.maybe_single.return_value = chain
    chain.eq.return_value = chain
    chain.select.return_value = chain
    mock_client.table.return_value = chain

    svc = ProfileService(mock_client)

    with pytest.raises(NotFoundError):
        await svc.get_profile("nonexistent-user")


@pytest.mark.asyncio
async def test_profile_service_update_profile():
    mock_client = MagicMock()
    updated_row = {
        "user_id": "user-123",
        "first_name": "Bob",
        "last_name": "Jones",
        "email": "bob@example.com",
        "work_experience": [],
        "education": [],
        "skills": [],
        "projects": [],
    }
    execute_mock = AsyncMock(return_value=MagicMock(data=[updated_row]))
    chain = MagicMock()
    chain.execute = execute_mock
    chain.eq.return_value = chain
    chain.update.return_value = chain
    mock_client.table.return_value = chain

    svc = ProfileService(mock_client)
    update = ProfileUpdate(first_name="Bob")
    profile = await svc.update_profile("user-123", update)

    assert profile.first_name == "Bob"
