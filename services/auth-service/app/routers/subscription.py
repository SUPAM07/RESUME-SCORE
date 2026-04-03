"""Subscription router: GET /subscription, POST /subscription/checkout,
POST /subscription/portal, POST /webhooks/stripe.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Header, Request, status
from fastapi.responses import JSONResponse

from app.dependencies import AppSettings, CurrentUserID, SupabaseClient
from app.models.subscription import (
    CreateCheckoutRequest,
    CreatePortalRequest,
    WebhookHandledResponse,
)
from app.services.subscription_service import SubscriptionService
from app.services.auth_service import AuthService
from app.utils.exceptions import ExternalServiceError
from app.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["subscription"])


def _make_response(data: object, request: Request) -> dict:
    request_id: str = getattr(request.state, "request_id", str(uuid.uuid4()))
    return {
        "success": True,
        "requestId": request_id,
        "data": data.model_dump() if hasattr(data, "model_dump") else data,
    }


async def _get_user_email(
    client,
    settings,
    user_id: str,
    authorization: str | None,
) -> str:
    """Best-effort fetch of the user's email for Stripe operations."""
    try:
        token = (authorization or "").removeprefix("Bearer ").strip()
        auth_svc = AuthService(client, settings)
        user = await auth_svc.get_me(token)
        return user.email
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# GET /subscription
# ---------------------------------------------------------------------------


@router.get("/subscription", summary="Get the current user's subscription")
async def get_subscription(
    request: Request,
    client: SupabaseClient,
    user_id: CurrentUserID,
    settings: AppSettings,
) -> dict:
    svc = SubscriptionService(client, settings)
    subscription = await svc.get_subscription(user_id)
    return _make_response(subscription, request)


# ---------------------------------------------------------------------------
# POST /subscription/checkout
# ---------------------------------------------------------------------------


@router.post("/subscription/checkout", summary="Create a Stripe Checkout session")
async def create_checkout(
    body: CreateCheckoutRequest,
    request: Request,
    client: SupabaseClient,
    user_id: CurrentUserID,
    settings: AppSettings,
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    email = await _get_user_email(client, settings, user_id, authorization)
    svc = SubscriptionService(client, settings)
    result = await svc.create_checkout_session(
        user_id=user_id,
        user_email=email,
        plan=body.plan,
        success_url=body.success_url,
        cancel_url=body.cancel_url,
    )
    return _make_response(result, request)


# ---------------------------------------------------------------------------
# POST /subscription/portal
# ---------------------------------------------------------------------------


@router.post("/subscription/portal", summary="Create a Stripe billing portal session")
async def create_portal(
    body: CreatePortalRequest,
    request: Request,
    client: SupabaseClient,
    user_id: CurrentUserID,
    settings: AppSettings,
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    email = await _get_user_email(client, settings, user_id, authorization)
    svc = SubscriptionService(client, settings)
    result = await svc.create_portal_session(
        user_id=user_id,
        user_email=email,
        return_url=body.return_url,
    )
    return _make_response(result, request)


# ---------------------------------------------------------------------------
# POST /webhooks/stripe
# ---------------------------------------------------------------------------


@router.post(
    "/webhooks/stripe",
    summary="Handle incoming Stripe webhook events",
    status_code=status.HTTP_200_OK,
    # Stripe sends raw bytes; do not use the JSON parser for this route
    response_model=None,
)
async def stripe_webhook(
    request: Request,
    client: SupabaseClient,
    settings: AppSettings,
    stripe_signature: Annotated[str | None, Header(alias="stripe-signature")] = None,
) -> JSONResponse:
    if not stripe_signature:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"success": False, "error": {"code": "MISSING_SIGNATURE", "message": "Missing Stripe-Signature header"}},
        )

    payload = await request.body()
    svc = SubscriptionService(client, settings)

    processed = await svc.handle_stripe_webhook(payload, stripe_signature)

    request_id: str = getattr(request.state, "request_id", str(uuid.uuid4()))
    return JSONResponse(
        content={
            "success": True,
            "requestId": request_id,
            "data": {"received": True, "processed": processed},
        }
    )
