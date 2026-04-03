"""Profile router: GET /profile, PUT /profile."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Request, status

from app.dependencies import AppSettings, CurrentUserID, SupabaseClient
from app.models.user import Profile, ProfileUpdate
from app.services.profile_service import ProfileService
from app.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/profile", tags=["profile"])


def _make_response(data: object, request: Request) -> dict:
    request_id: str = getattr(request.state, "request_id", str(uuid.uuid4()))
    return {
        "success": True,
        "requestId": request_id,
        "data": data.model_dump() if hasattr(data, "model_dump") else data,
    }


# ---------------------------------------------------------------------------
# GET /profile
# ---------------------------------------------------------------------------


@router.get("", summary="Get the current user's profile")
async def get_profile(
    request: Request,
    client: SupabaseClient,
    user_id: CurrentUserID,
) -> dict:
    svc = ProfileService(client)
    profile = await svc.get_profile(user_id)
    return _make_response(profile, request)


# ---------------------------------------------------------------------------
# PUT /profile
# ---------------------------------------------------------------------------


@router.put("", summary="Update the current user's profile")
async def update_profile(
    body: ProfileUpdate,
    request: Request,
    client: SupabaseClient,
    user_id: CurrentUserID,
) -> dict:
    svc = ProfileService(client)
    profile = await svc.update_profile(user_id, body)
    logger.info("profile_updated", user_id=user_id)
    return _make_response(profile, request)
