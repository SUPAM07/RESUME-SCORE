"""Auth router: /auth/register, /auth/login, /auth/logout,
/auth/refresh, /auth/me, /auth/verify.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Header, Request, status
from fastapi.responses import JSONResponse

from app.dependencies import AppSettings, CurrentUserID, SupabaseClient
from app.models.user import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
    VerifyTokenRequest,
    VerifyTokenResponse,
)
from app.services.auth_service import AuthService
from app.services.profile_service import ProfileService
from app.services.subscription_service import SubscriptionService
from app.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def _make_response(data: object, request: Request) -> dict:
    request_id: str = getattr(request.state, "request_id", str(uuid.uuid4()))
    return {
        "success": True,
        "requestId": request_id,
        "data": data.model_dump() if hasattr(data, "model_dump") else data,
    }


# ---------------------------------------------------------------------------
# POST /auth/register
# ---------------------------------------------------------------------------


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
async def register(
    body: RegisterRequest,
    request: Request,
    client: SupabaseClient,
    settings: AppSettings,
) -> JSONResponse:
    auth_svc = AuthService(client, settings)
    token = await auth_svc.register(
        email=body.email,
        password=body.password,
        first_name=body.first_name,
        last_name=body.last_name,
    )

    # Optimistically provision a profile row if a session was returned
    if token.access_token:
        try:
            user = await auth_svc.get_me(token.access_token)
            profile_svc = ProfileService(client)
            await profile_svc.create_profile(
                user_id=user.id,
                email=user.email,
                first_name=body.first_name,
                last_name=body.last_name,
            )
        except Exception as exc:
            logger.warning("post_register_profile_error", error=str(exc))

    logger.info("user_registered", email=body.email)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=_make_response(token, request),
    )


# ---------------------------------------------------------------------------
# POST /auth/login
# ---------------------------------------------------------------------------


@router.post("/login", summary="Login with email and password")
async def login(
    body: LoginRequest,
    request: Request,
    client: SupabaseClient,
    settings: AppSettings,
) -> dict:
    auth_svc = AuthService(client, settings)
    token = await auth_svc.login(email=body.email, password=body.password)
    logger.info("user_login", email=body.email)
    return _make_response(token, request)


# ---------------------------------------------------------------------------
# POST /auth/logout
# ---------------------------------------------------------------------------


@router.post("/logout", summary="Logout and invalidate session")
async def logout(
    request: Request,
    client: SupabaseClient,
    settings: AppSettings,
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    token = (authorization or "").removeprefix("Bearer ").strip()
    auth_svc = AuthService(client, settings)
    await auth_svc.logout(token)
    request_id: str = getattr(request.state, "request_id", str(uuid.uuid4()))
    return {"success": True, "requestId": request_id, "data": {"message": "Logged out"}}


# ---------------------------------------------------------------------------
# POST /auth/refresh
# ---------------------------------------------------------------------------


@router.post("/refresh", summary="Refresh access token")
async def refresh(
    body: RefreshRequest,
    request: Request,
    client: SupabaseClient,
    settings: AppSettings,
) -> dict:
    auth_svc = AuthService(client, settings)
    token = await auth_svc.refresh(body.refresh_token)
    return _make_response(token, request)


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------


@router.get("/me", summary="Get current authenticated user")
async def get_me(
    request: Request,
    client: SupabaseClient,
    settings: AppSettings,
    user_id: CurrentUserID,
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    token = (authorization or "").removeprefix("Bearer ").strip()
    auth_svc = AuthService(client, settings)
    user = await auth_svc.get_me(token)
    return _make_response(user, request)


# ---------------------------------------------------------------------------
# POST /auth/verify
# ---------------------------------------------------------------------------


@router.post("/verify", summary="Verify a JWT token (used by other services)")
async def verify_token(
    body: VerifyTokenRequest,
    request: Request,
    client: SupabaseClient,
    settings: AppSettings,
) -> dict:
    auth_svc = AuthService(client, settings)

    # Fetch subscription plan to enrich the verification response
    plan = "free"
    try:
        from jose import jwt as jose_jwt

        payload = jose_jwt.decode(
            body.token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"verify_aud": False},
        )
        user_id = payload.get("sub", "")
        if user_id:
            sub_svc = SubscriptionService(client, settings)
            sub = await sub_svc.get_subscription(user_id)
            plan = sub.subscription_plan
    except Exception:
        pass

    result = await auth_svc.verify_token(body.token, subscription_plan=plan)
    return _make_response(result, request)
