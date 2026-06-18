import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import settings
from app.services.meeting_service import (
    append_transcript_segment,
    finish_recording,
    get_meeting,
    start_recording,
)
from app.services.redis_service import get_redis
from app.services.transcription import TranscriptionSession
from app.utils.audio import is_valid_pcm16_chunk

logger = logging.getLogger(__name__)
router = APIRouter()

# Section 11: max 1 active recording per IP at a time. In-memory is fine —
# Render free tier runs a single instance, and this state is not meant to persist.
_active_recording_ips: set[str] = set()


@router.websocket("/ws/meetings/{meeting_id}/audio")
async def audio_websocket(websocket: WebSocket, meeting_id: str):
    meeting = await get_meeting(meeting_id)
    if meeting is None:
        await websocket.close(code=4404)
        return

    client_ip = websocket.client.host if websocket.client else "unknown"
    if client_ip in _active_recording_ips:
        await websocket.close(code=4429)
        return
    _active_recording_ips.add(client_ip)

    await websocket.accept()
    redis = get_redis()

    async def on_transcript_delta(text: str, is_final: bool):
        """Called for every transcript delta from OpenAI Realtime API."""
        event = json.dumps({
            "type": "transcript_delta",
            "text": text,
            "is_final": is_final,
            "meeting_id": meeting_id,
        })
        # Publish to Redis so the SSE endpoint picks it up
        await redis.publish(f"meeting:{meeting_id}:transcript", event)

        if is_final:
            await append_transcript_segment(
                meeting_id=meeting_id,
                text=text,
                is_final=True,
            )

    session = TranscriptionSession(
        api_key=settings.OPENAI_API_KEY,
        model=settings.OPENAI_REALTIME_MODEL,
        on_delta=on_transcript_delta,
    )

    try:
        await start_recording(meeting_id)
        await session.connect()

        # A single receive loop — dispatching on message type — avoids two tasks
        # racing on the same underlying ASGI receive channel (binary chunks were
        # occasionally landing in the text-only reader and crashing it).
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break

            data = message.get("bytes")
            if data is not None:
                if not is_valid_pcm16_chunk(data):
                    logger.warning("Dropping invalid/oversized PCM16 chunk (%d bytes)", len(data))
                    continue
                await session.send_audio(data)
                continue

            text = message.get("text")
            if text is not None:
                payload = json.loads(text)
                if payload.get("type") == "stop":
                    break

    except WebSocketDisconnect:
        pass
    finally:
        _active_recording_ips.discard(client_ip)
        full_transcript = await session.close()
        await finish_recording(meeting_id)
        # Publish end event — SSE stream picks this up and triggers agent
        await redis.publish(
            f"meeting:{meeting_id}:transcript",
            json.dumps({"type": "recording_ended", "meeting_id": meeting_id, "transcript": full_transcript}),
        )
