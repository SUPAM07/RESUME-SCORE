"""Auth business logic — wraps the Supabase GoTrue client."""

from __future__ import annotations

from datetime import datetime, timezone

from jose import JWTError, jwt
from supabase import AsyncClient

from app.config import Settings
from app.models.user import (
    TokenResponse,
    UserResponse,
    VerifyTokenResponse,
)
from app.utils.exceptions import AuthenticationError, ConflictError, ExternalServiceError
from app.utils.logger import get_logger

logger = get_logger(__name__)


class AuthService:
    def __init__(self, client: AsyncClient, settings: Settings) -> None:
        self._client = client
        self._settings = settings

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    async def register(
        self,
        email: str,
        password: str,
        first_name: str | None = None,
        last_name: str | None = None,
    ) -> TokenResponse:
        """Create a new Supabase auth user and return tokens."""
        try:
            metadata: dict[str, str] = {}
            if first_name:
                metadata["first_name"] = first_name
            if last_name:
                metadata["last_name"] = last_name

            response = await self._client.auth.sign_up(
                {
                    "email": email,
                    "password": password,
                    "options": {"data": metadata} if metadata else {},
                }
            )
        except Exception as exc:
            msg = str(exc).lower()
            if "already registered" in msg or "already exists" in msg:
                raise ConflictError("A user with that email already exists") from exc
            logger.error("supabase_register_error", error=str(exc))
            raise ExternalServiceError("Supabase", str(exc)) from exc

        if response.user is None:
            raise ExternalServiceError("Supabase", "User creation returned no user")

        session = response.session
        if session is None:
            # Email confirmation required — return empty tokens with 0 expiry
            logger.info("register_confirmation_required", email=email)
            return TokenResponse(
                access_token="",
                refresh_token="",
                expires_in=0,
            )

        logger.info("user_registered", user_id=response.user.id)
        return TokenResponse(
            access_token=session.access_token,
            refresh_token=session.refresh_token,
            expires_in=session.expires_in or 3600,
        )

    # ------------------------------------------------------------------
    # Login
    # ------------------------------------------------------------------

    async def login(self, email: str, password: str) -> TokenResponse:
        """Sign in with email/password via Supabase GoTrue."""
        try:
            response = await self._client.auth.sign_in_with_password(
                {"email": email, "password": password}
            )
        except Exception as exc:
            msg = str(exc).lower()
            if "invalid" in msg or "credentials" in msg or "password" in msg:
                raise AuthenticationError("Invalid email or password") from exc
            logger.error("supabase_login_error", error=str(exc))
            raise ExternalServiceError("Supabase", str(exc)) from exc

        session = response.session
        if session is None:
            raise AuthenticationError("Login did not return a session")

        logger.info("user_logged_in", user_id=response.user.id if response.user else "unknown")
        return TokenResponse(
            access_token=session.access_token,
            refresh_token=session.refresh_token,
            expires_in=session.expires_in or 3600,
        )

    # ------------------------------------------------------------------
    # Logout
    # ------------------------------------------------------------------

    async def logout(self, access_token: str) -> None:
        """Invalidate the current session in Supabase."""
        try:
            # Set the session so sign_out targets the correct token
            await self._client.auth.set_session(access_token, "")
            await self._client.auth.sign_out()
        except Exception as exc:
            # Log but don't surface — the client should clear tokens regardless
            logger.warning("supabase_logout_error", error=str(exc))

    # ------------------------------------------------------------------
    # Token refresh
    # ------------------------------------------------------------------

    async def refresh(self, refresh_token: str) -> TokenResponse:
        """Exchange a refresh token for a new access/refresh pair."""
        try:
            response = await self._client.auth.refresh_session(refresh_token)
        except Exception as exc:
            msg = str(exc).lower()
            if "invalid" in msg or "expired" in msg or "revoked" in msg:
                raise AuthenticationError("Refresh token is invalid or expired") from exc
            logger.error("supabase_refresh_error", error=str(exc))
            raise ExternalServiceError("Supabase", str(exc)) from exc

        session = response.session
        if session is None:
            raise AuthenticationError("Token refresh did not return a session")

        return TokenResponse(
            access_token=session.access_token,
            refresh_token=session.refresh_token,
            expires_in=session.expires_in or 3600,
        )

    # ------------------------------------------------------------------
    # Current user
    # ------------------------------------------------------------------

    async def get_me(self, access_token: str) -> UserResponse:
        """Return the authenticated user's basic details."""
        try:
            await self._client.auth.set_session(access_token, "")
            user_response = await self._client.auth.get_user(access_token)
        except Exception as exc:
            raise AuthenticationError("Could not retrieve user details") from exc

        user = user_response.user
        if user is None:
            raise AuthenticationError("Token is valid but returned no user")

        return UserResponse(
            id=str(user.id),
            email=user.email or "",
            email_confirmed=user.email_confirmed_at is not None,
            created_at=user.created_at,
        )

    # ------------------------------------------------------------------
    # Token verification (used by other services via POST /auth/verify)
    # ------------------------------------------------------------------

    async def verify_token(
        self,
        token: str,
        subscription_plan: str = "free",
    ) -> VerifyTokenResponse:
        """Decode and validate a JWT, returning the user claims."""
        try:
            payload = jwt.decode(
                token,
                self._settings.jwt_secret,
                algorithms=[self._settings.jwt_algorithm],
                options={"verify_aud": False},
            )
        except JWTError as exc:
            raise AuthenticationError("Token is invalid or expired") from exc

        user_id: str = payload.get("sub", "")
        email: str = payload.get("email", "")
        exp: int | None = payload.get("exp")

        if not user_id:
            raise AuthenticationError("Token is missing subject claim")

        expires_at = (
            datetime.fromtimestamp(exp, tz=timezone.utc).isoformat()
            if exp
            else ""
        )

        return VerifyTokenResponse(
            user_id=user_id,
            email=email,
            expires_at=expires_at,
            subscription_plan=subscription_plan,
        )
