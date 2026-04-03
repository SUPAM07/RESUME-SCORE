"""Profile CRUD operations against the public.profiles table."""

from __future__ import annotations

from supabase import AsyncClient

from app.models.user import Profile, ProfileUpdate
from app.utils.exceptions import NotFoundError, ExternalServiceError
from app.utils.logger import get_logger

logger = get_logger(__name__)

_TABLE = "profiles"


class ProfileService:
    def __init__(self, client: AsyncClient) -> None:
        self._client = client

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def get_profile(self, user_id: str) -> Profile:
        """Fetch a user's profile row.  Raises :class:`NotFoundError` if absent."""
        try:
            result = (
                await self._client.table(_TABLE)
                .select("*")
                .eq("user_id", user_id)
                .maybe_single()
                .execute()
            )
        except Exception as exc:
            logger.error("profile_fetch_error", user_id=user_id, error=str(exc))
            raise ExternalServiceError("Supabase", str(exc)) from exc

        if result.data is None:
            raise NotFoundError("Profile")

        return _row_to_profile(result.data)

    # ------------------------------------------------------------------
    # Create (idempotent upsert — called after registration)
    # ------------------------------------------------------------------

    async def create_profile(
        self,
        user_id: str,
        email: str | None = None,
        first_name: str | None = None,
        last_name: str | None = None,
    ) -> Profile:
        """Insert a new profile row (or silently update if it already exists)."""
        payload: dict[str, object] = {
            "user_id": user_id,
            "email": email,
            "first_name": first_name,
            "last_name": last_name,
            "work_experience": [],
            "education": [],
            "skills": [],
            "projects": [],
        }
        # Strip None values so Supabase defaults apply
        payload = {k: v for k, v in payload.items() if v is not None}
        payload["user_id"] = user_id  # always required

        try:
            result = (
                await self._client.table(_TABLE)
                .upsert(payload, on_conflict="user_id")
                .execute()
            )
        except Exception as exc:
            logger.error("profile_create_error", user_id=user_id, error=str(exc))
            raise ExternalServiceError("Supabase", str(exc)) from exc

        if not result.data:
            raise ExternalServiceError("Supabase", "Profile upsert returned no data")

        return _row_to_profile(result.data[0])

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------

    async def update_profile(self, user_id: str, update: ProfileUpdate) -> Profile:
        """Apply a partial update to a user's profile."""
        # Exclude fields that were not supplied by the caller
        patch = update.model_dump(exclude_none=True, exclude_unset=True)
        if not patch:
            return await self.get_profile(user_id)

        # Serialize nested Pydantic models to plain dicts
        for key in ("work_experience", "education", "skills", "projects"):
            if key in patch and isinstance(patch[key], list):
                patch[key] = [
                    item.model_dump() if hasattr(item, "model_dump") else item
                    for item in patch[key]
                ]

        try:
            result = (
                await self._client.table(_TABLE)
                .update(patch)
                .eq("user_id", user_id)
                .execute()
            )
        except Exception as exc:
            logger.error("profile_update_error", user_id=user_id, error=str(exc))
            raise ExternalServiceError("Supabase", str(exc)) from exc

        if not result.data:
            raise NotFoundError("Profile")

        return _row_to_profile(result.data[0])


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _row_to_profile(row: dict) -> Profile:
    """Convert a raw Supabase row dict to a :class:`Profile` model."""
    return Profile.model_validate(row)
