"""Pydantic models for subscriptions.

Mirrors the public.subscriptions table and the shared TypeScript Subscription type.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Subscription(BaseModel):
    """Full subscription record returned to the client."""

    user_id: str
    stripe_customer_id: str | None = None
    stripe_subscription_id: str | None = None
    subscription_plan: Literal["free", "pro"] = "free"
    subscription_status: Literal["active", "canceled"] | None = None
    current_period_end: datetime | None = None
    trial_end: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CreateCheckoutRequest(BaseModel):
    plan: Literal["pro"]
    success_url: str = Field(description="URL Stripe redirects to after success")
    cancel_url: str = Field(description="URL Stripe redirects to after cancellation")


class CreateCheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


class CreatePortalRequest(BaseModel):
    return_url: str = Field(description="URL to return to after leaving the portal")


class CreatePortalResponse(BaseModel):
    portal_url: str


class WebhookHandledResponse(BaseModel):
    received: bool = True
