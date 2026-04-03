"""Subscription management: reads from Supabase, writes via Stripe."""

from __future__ import annotations

import stripe
from supabase import AsyncClient

from app.config import Settings
from app.models.subscription import (
    CreateCheckoutResponse,
    CreatePortalResponse,
    Subscription,
)
from app.utils.exceptions import (
    ExternalServiceError,
    NotFoundError,
    ConflictError,
)
from app.utils.logger import get_logger

logger = get_logger(__name__)

_TABLE = "subscriptions"
_WEBHOOK_TABLE = "stripe_webhook_events"


class SubscriptionService:
    def __init__(self, client: AsyncClient, settings: Settings) -> None:
        self._client = client
        self._settings = settings
        if settings.stripe_secret_key:
            stripe.api_key = settings.stripe_secret_key

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def get_subscription(self, user_id: str) -> Subscription:
        """Fetch the subscription record for *user_id*.

        If no row exists yet, returns a synthetic free-tier record so the
        caller always gets a valid response.
        """
        try:
            result = (
                await self._client.table(_TABLE)
                .select("*")
                .eq("user_id", user_id)
                .maybe_single()
                .execute()
            )
        except Exception as exc:
            logger.error("subscription_fetch_error", user_id=user_id, error=str(exc))
            raise ExternalServiceError("Supabase", str(exc)) from exc

        if result.data is None:
            # Lazily provision a free-tier record
            return await self._create_free_subscription(user_id)

        return Subscription.model_validate(result.data)

    # ------------------------------------------------------------------
    # Stripe checkout session
    # ------------------------------------------------------------------

    async def create_checkout_session(
        self,
        user_id: str,
        user_email: str,
        plan: str,
        success_url: str,
        cancel_url: str,
    ) -> CreateCheckoutResponse:
        """Create a Stripe Checkout session for the *pro* plan."""
        if not self._settings.stripe_secret_key:
            raise ExternalServiceError("Stripe", "Stripe is not configured")
        if not self._settings.stripe_pro_price_id:
            raise ExternalServiceError("Stripe", "Pro price ID is not configured")

        subscription = await self.get_subscription(user_id)
        if subscription.subscription_plan == "pro" and subscription.subscription_status == "active":
            raise ConflictError("User already has an active pro subscription")

        customer_id = subscription.stripe_customer_id
        if not customer_id:
            customer_id = await self._get_or_create_stripe_customer(user_id, user_email)

        try:
            session = stripe.checkout.Session.create(
                customer=customer_id,
                payment_method_types=["card"],
                line_items=[{"price": self._settings.stripe_pro_price_id, "quantity": 1}],
                mode="subscription",
                success_url=success_url,
                cancel_url=cancel_url,
                metadata={"user_id": user_id},
            )
        except stripe.StripeError as exc:
            logger.error("stripe_checkout_error", user_id=user_id, error=str(exc))
            raise ExternalServiceError("Stripe", str(exc)) from exc

        return CreateCheckoutResponse(
            checkout_url=session.url or "",
            session_id=session.id,
        )

    # ------------------------------------------------------------------
    # Stripe billing portal
    # ------------------------------------------------------------------

    async def create_portal_session(
        self,
        user_id: str,
        user_email: str,
        return_url: str,
    ) -> CreatePortalResponse:
        """Create a Stripe Customer Portal session."""
        if not self._settings.stripe_secret_key:
            raise ExternalServiceError("Stripe", "Stripe is not configured")

        subscription = await self.get_subscription(user_id)
        customer_id = subscription.stripe_customer_id
        if not customer_id:
            customer_id = await self._get_or_create_stripe_customer(user_id, user_email)

        try:
            session = stripe.billing_portal.Session.create(
                customer=customer_id,
                return_url=return_url,
            )
        except stripe.StripeError as exc:
            logger.error("stripe_portal_error", user_id=user_id, error=str(exc))
            raise ExternalServiceError("Stripe", str(exc)) from exc

        return CreatePortalResponse(portal_url=session.url)

    # ------------------------------------------------------------------
    # Stripe webhook processing
    # ------------------------------------------------------------------

    async def handle_stripe_webhook(
        self, payload: bytes, stripe_signature: str
    ) -> bool:
        """Validate and process a Stripe webhook event.

        Returns ``True`` if the event was processed, ``False`` if it was a
        duplicate (already recorded in *stripe_webhook_events*).
        """
        if not self._settings.stripe_webhook_secret:
            raise ExternalServiceError("Stripe", "Webhook secret is not configured")

        try:
            event = stripe.Webhook.construct_event(
                payload, stripe_signature, self._settings.stripe_webhook_secret
            )
        except stripe.SignatureVerificationError as exc:
            raise ExternalServiceError("Stripe", "Invalid webhook signature") from exc
        except Exception as exc:
            raise ExternalServiceError("Stripe", f"Webhook parsing failed: {exc}") from exc

        event_id: str = event["id"]
        event_type: str = event["type"]

        # Idempotency check
        if await self._webhook_already_processed(event_id):
            logger.info("stripe_webhook_duplicate", event_id=event_id, event_type=event_type)
            return False

        logger.info("stripe_webhook_received", event_id=event_id, event_type=event_type)

        handlers = {
            "customer.subscription.created": self._on_subscription_created,
            "customer.subscription.updated": self._on_subscription_updated,
            "customer.subscription.deleted": self._on_subscription_deleted,
            "checkout.session.completed": self._on_checkout_completed,
        }

        handler = handlers.get(event_type)
        if handler:
            await handler(event["data"]["object"])

        await self._record_webhook_event(event_id, event_type)
        return True

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _create_free_subscription(self, user_id: str) -> Subscription:
        payload = {
            "user_id": user_id,
            "subscription_plan": "free",
        }
        try:
            result = (
                await self._client.table(_TABLE)
                .upsert(payload, on_conflict="user_id")
                .execute()
            )
        except Exception as exc:
            logger.error("subscription_create_error", user_id=user_id, error=str(exc))
            raise ExternalServiceError("Supabase", str(exc)) from exc

        if not result.data:
            return Subscription(user_id=user_id, subscription_plan="free")
        return Subscription.model_validate(result.data[0])

    async def _get_or_create_stripe_customer(
        self, user_id: str, email: str
    ) -> str:
        try:
            customers = stripe.Customer.list(email=email, limit=1)
            if customers.data:
                customer_id = customers.data[0].id
            else:
                customer = stripe.Customer.create(
                    email=email,
                    metadata={"user_id": user_id},
                )
                customer_id = customer.id
        except stripe.StripeError as exc:
            raise ExternalServiceError("Stripe", str(exc)) from exc

        # Persist the customer ID
        await self._upsert_subscription(user_id, {"stripe_customer_id": customer_id})
        return customer_id

    async def _upsert_subscription(
        self, user_id: str, patch: dict
    ) -> None:
        patch["user_id"] = user_id
        try:
            await (
                self._client.table(_TABLE)
                .upsert(patch, on_conflict="user_id")
                .execute()
            )
        except Exception as exc:
            logger.error("subscription_upsert_error", user_id=user_id, error=str(exc))

    async def _on_checkout_completed(self, session: dict) -> None:
        """Associate the Stripe customer with the internal user after checkout."""
        user_id: str | None = (session.get("metadata") or {}).get("user_id")
        customer_id: str | None = session.get("customer")
        if user_id and customer_id:
            await self._upsert_subscription(
                user_id, {"stripe_customer_id": customer_id}
            )

    async def _on_subscription_created(self, sub: dict) -> None:
        await self._sync_subscription(sub)

    async def _on_subscription_updated(self, sub: dict) -> None:
        await self._sync_subscription(sub)

    async def _on_subscription_deleted(self, sub: dict) -> None:
        customer_id: str | None = sub.get("customer")
        if not customer_id:
            return
        user_id = await self._user_id_for_customer(customer_id)
        if user_id:
            await self._upsert_subscription(
                user_id,
                {
                    "subscription_plan": "free",
                    "subscription_status": "canceled",
                    "stripe_subscription_id": sub.get("id"),
                },
            )

    async def _sync_subscription(self, sub: dict) -> None:
        customer_id: str | None = sub.get("customer")
        if not customer_id:
            return
        user_id = await self._user_id_for_customer(customer_id)
        if not user_id:
            logger.warning("stripe_no_user_for_customer", customer_id=customer_id)
            return

        status: str = sub.get("status", "")
        plan = "pro" if status in ("active", "trialing") else "free"
        mapped_status = "active" if status in ("active", "trialing") else "canceled"

        period_end_ts = sub.get("current_period_end")
        trial_end_ts = sub.get("trial_end")

        from datetime import datetime, timezone

        patch: dict = {
            "subscription_plan": plan,
            "subscription_status": mapped_status,
            "stripe_subscription_id": sub.get("id"),
            "stripe_customer_id": customer_id,
        }
        if period_end_ts:
            patch["current_period_end"] = datetime.fromtimestamp(
                period_end_ts, tz=timezone.utc
            ).isoformat()
        if trial_end_ts:
            patch["trial_end"] = datetime.fromtimestamp(
                trial_end_ts, tz=timezone.utc
            ).isoformat()

        await self._upsert_subscription(user_id, patch)

    async def _user_id_for_customer(self, customer_id: str) -> str | None:
        try:
            result = (
                await self._client.table(_TABLE)
                .select("user_id")
                .eq("stripe_customer_id", customer_id)
                .maybe_single()
                .execute()
            )
            return result.data["user_id"] if result.data else None
        except Exception:
            return None

    async def _webhook_already_processed(self, event_id: str) -> bool:
        try:
            result = (
                await self._client.table(_WEBHOOK_TABLE)
                .select("event_id")
                .eq("event_id", event_id)
                .maybe_single()
                .execute()
            )
            return result.data is not None
        except Exception:
            return False

    async def _record_webhook_event(self, event_id: str, event_type: str) -> None:
        from datetime import datetime, timezone

        try:
            await (
                self._client.table(_WEBHOOK_TABLE)
                .insert(
                    {
                        "event_id": event_id,
                        "event_type": event_type,
                        "processed_at": datetime.now(tz=timezone.utc).isoformat(),
                    }
                )
                .execute()
            )
        except Exception as exc:
            logger.error("webhook_record_error", event_id=event_id, error=str(exc))
