"""Unit tests for auth routes and AuthService."""

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
from app.services.auth_service import AuthService  # noqa: E402
from app.models.user import TokenResponse, UserResponse  # noqa: E402

# ── Dependency overrides ──────────────────────────────────────────────────────

_mock_supabase = MagicMock()
_mock_redis = AsyncMock()
_mock_redis.ping = AsyncMock(return_value=True)

app.dependency_overrides[get_supabase_client] = lambda: _mock_supabase
app.dependency_overrides[get_redis] = lambda: _mock_redis

client = TestClient(app, raise_server_exceptions=False)

settings = get_settings()


# ---------------------------------------------------------------------------
# Helper fixtures
# ---------------------------------------------------------------------------


def _make_token() -> TokenResponse:
    return TokenResponse(
        access_token="access.token.here",
        refresh_token="refresh.token.here",
        expires_in=3600,
    )


def _make_user() -> UserResponse:
    return UserResponse(
        id="user-uuid-1234",
        email="user@example.com",
        email_confirmed=True,
    )


def _bearer(user_id: str = "user-uuid-1234") -> str:
    from jose import jwt

    payload = {
        "sub": user_id,
        "email": "user@example.com",
        "exp": int((datetime.now(tz=timezone.utc) + timedelta(hours=1)).timestamp()),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return f"Bearer {token}"


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


def test_health_endpoint():
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["service"] == "auth-service"


# ---------------------------------------------------------------------------
# POST /auth/register
# ---------------------------------------------------------------------------


def test_register_success():
    token = _make_token()
    user = _make_user()

    with (
        patch("app.routers.auth.AuthService") as MockAuth,
        patch("app.routers.auth.ProfileService") as MockProfile,
    ):
        mock_auth_instance = AsyncMock()
        mock_auth_instance.register.return_value = token
        mock_auth_instance.get_me.return_value = user
        MockAuth.return_value = mock_auth_instance

        mock_profile_instance = AsyncMock()
        mock_profile_instance.create_profile.return_value = MagicMock()
        MockProfile.return_value = mock_profile_instance

        resp = client.post(
            "/auth/register",
            json={
                "email": "newuser@example.com",
                "password": "Password123",
                "first_name": "Jane",
                "last_name": "Doe",
            },
        )

    assert resp.status_code == 201
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["access_token"] == "access.token.here"


def test_register_invalid_email():
    resp = client.post(
        "/auth/register",
        json={"email": "not-an-email", "password": "Password123"},
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["success"] is False


def test_register_password_too_short():
    resp = client.post(
        "/auth/register",
        json={"email": "user@example.com", "password": "short"},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /auth/login
# ---------------------------------------------------------------------------


def test_login_success():
    token = _make_token()

    with patch("app.routers.auth.AuthService") as MockAuth:
        mock_instance = AsyncMock()
        mock_instance.login.return_value = token
        MockAuth.return_value = mock_instance

        resp = client.post(
            "/auth/login",
            json={"email": "user@example.com", "password": "Password123"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert "access_token" in body["data"]


def test_login_wrong_credentials():
    from app.utils.exceptions import AuthenticationError

    with patch("app.routers.auth.AuthService") as MockAuth:
        mock_instance = AsyncMock()
        mock_instance.login.side_effect = AuthenticationError("Invalid email or password")
        MockAuth.return_value = mock_instance

        resp = client.post(
            "/auth/login",
            json={"email": "user@example.com", "password": "wrong"},
        )

    assert resp.status_code == 401
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "AUTHENTICATION_ERROR"


# ---------------------------------------------------------------------------
# POST /auth/refresh
# ---------------------------------------------------------------------------


def test_refresh_success():
    new_token = _make_token()

    with patch("app.routers.auth.AuthService") as MockAuth:
        mock_instance = AsyncMock()
        mock_instance.refresh.return_value = new_token
        MockAuth.return_value = mock_instance

        resp = client.post(
            "/auth/refresh",
            json={"refresh_token": "old-refresh-token"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["refresh_token"] == "refresh.token.here"


# ---------------------------------------------------------------------------
# POST /auth/logout
# ---------------------------------------------------------------------------


def test_logout_success():
    with patch("app.routers.auth.AuthService") as MockAuth:
        mock_instance = AsyncMock()
        mock_instance.logout.return_value = None
        MockAuth.return_value = mock_instance

        resp = client.post(
            "/auth/logout",
            headers={"Authorization": _bearer()},
        )

    assert resp.status_code == 200
    assert resp.json()["success"] is True


# ---------------------------------------------------------------------------
# GET /auth/me  (requires valid JWT)
# ---------------------------------------------------------------------------


def test_get_me_missing_auth():
    resp = client.get("/auth/me")
    assert resp.status_code == 401


def test_get_me_invalid_token():
    resp = client.get(
        "/auth/me",
        headers={"Authorization": "Bearer this.is.not.valid"},
    )
    assert resp.status_code == 401


def test_get_me_success():
    user = _make_user()

    with patch("app.routers.auth.AuthService") as MockAuth:
        mock_instance = AsyncMock()
        mock_instance.get_me.return_value = user
        MockAuth.return_value = mock_instance

        resp = client.get(
            "/auth/me",
            headers={"Authorization": _bearer()},
        )

    assert resp.status_code == 200
    assert resp.json()["data"]["email"] == "user@example.com"


# ---------------------------------------------------------------------------
# AuthService unit tests (no HTTP)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_auth_service_verify_token_valid():
    from jose import jwt

    payload = {
        "sub": "user-id-abc",
        "email": "test@example.com",
        "exp": int((datetime.now(tz=timezone.utc) + timedelta(hours=1)).timestamp()),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    mock_client = MagicMock()
    svc = AuthService(mock_client, settings)
    result = await svc.verify_token(token)

    assert result.user_id == "user-id-abc"
    assert result.email == "test@example.com"


@pytest.mark.asyncio
async def test_auth_service_verify_token_expired():
    from jose import jwt
    from app.utils.exceptions import AuthenticationError

    payload = {
        "sub": "user-id-abc",
        "email": "test@example.com",
        "exp": int((datetime.now(tz=timezone.utc) - timedelta(hours=1)).timestamp()),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    mock_client = MagicMock()
    svc = AuthService(mock_client, settings)

    with pytest.raises(AuthenticationError):
        await svc.verify_token(token)

