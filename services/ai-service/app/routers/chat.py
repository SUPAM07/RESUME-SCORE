"""Chat router — SSE streaming chat endpoint."""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from sse_starlette.sse import EventSourceResponse

from app.config import Settings, get_settings
from app.dependencies import CurrentUserID
from app.models.requests import ChatStreamRequest
from app.services.chat_service import stream_chat
from app.utils.logger import get_logger

router = APIRouter(prefix="/chat", tags=["chat"])
limiter = Limiter(key_func=get_remote_address)
logger = get_logger(__name__)


async def _sse_generator(
    request: Request,
    chat_request: ChatStreamRequest,
    settings: Settings,
) -> AsyncGenerator[dict, None]:
    """Yield SSE events from the AI stream, handling disconnects."""
    try:
        async for token in stream_chat(chat_request, settings):
            # Check if the client has disconnected
            if await request.is_disconnected():
                logger.info("chat_client_disconnected")
                break
            yield {"data": json.dumps({"token": token, "done": False})}
        yield {"data": json.dumps({"token": "", "done": True})}
    except Exception as exc:
        logger.error("chat_stream_error", error=str(exc))
        yield {"data": json.dumps({"error": str(exc), "done": True})}


@router.post("/stream")
async def stream_chat_endpoint(
    request: Request,
    body: ChatStreamRequest,
    user_id: CurrentUserID,
    settings: Settings = Depends(get_settings),
) -> EventSourceResponse:
    """Stream AI chat responses as Server-Sent Events.

    Requires a valid Supabase JWT in the Authorization header.
    """
    logger.info("chat_stream_request", user_id=user_id, provider=body.provider)
    return EventSourceResponse(_sse_generator(request, body, settings))
