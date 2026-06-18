import asyncio
import base64
import json
import logging
from typing import Awaitable, Callable, Optional

import websockets

from app.config import settings

logger = logging.getLogger(__name__)


class TranscriptionSession:
    def __init__(
        self,
        api_key: str,
        model: str = "gpt-realtime-whisper",
        on_delta: Optional[Callable[[str, bool], Awaitable[None]]] = None,
    ):
        self.api_key = api_key
        self.model = model
        self.on_delta = on_delta
        self._ws = None
        self._transcript_parts: list[str] = []
        self._receiver_task: Optional[asyncio.Task] = None

    async def connect(self):
        url = "wss://api.openai.com/v1/realtime?intent=transcription"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
        }
        self._ws = await websockets.connect(url, extra_headers=headers)

        await self._ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "type": "transcription",
                "audio": {
                    "input": {
                        "format": {"type": "audio/pcm", "rate": settings.AUDIO_SAMPLE_RATE},
                        "transcription": {"model": self.model},
                    }
                },
            },
        }))

        self._receiver_task = asyncio.create_task(self._receive_loop())

    async def send_audio(self, pcm16_bytes: bytes):
        if not self._ws:
            return
        audio_b64 = base64.b64encode(pcm16_bytes).decode()
        await self._ws.send(json.dumps({
            "type": "input_audio_buffer.append",
            "audio": audio_b64,
        }))

    async def _receive_loop(self):
        # gpt-realtime-whisper is a pure continuous-streaming model: the "completed"
        # event carries no transcript field at all (just usage stats) — the deltas
        # are the only source of truth for the text, so we accumulate them ourselves.
        current_text = ""
        try:
            async for raw in self._ws:
                event = json.loads(raw)
                event_type = event.get("type", "")

                if event_type == "conversation.item.input_audio_transcription.delta":
                    delta = event.get("delta", "")
                    if delta:
                        current_text += delta
                        if self.on_delta:
                            await self.on_delta(delta, is_final=False)

                elif event_type == "conversation.item.input_audio_transcription.completed":
                    text = current_text.strip()
                    if text:
                        self._transcript_parts.append(text)
                        if self.on_delta:
                            await self.on_delta(text, is_final=True)
                    current_text = ""

                elif event_type == "error":
                    logger.warning("OpenAI Realtime API error event: %s", event.get("error"))
        except websockets.exceptions.ConnectionClosed:
            logger.info("OpenAI Realtime API connection closed")

    async def close(self) -> str:
        if self._ws:
            try:
                # Force finalization of whatever's buffered — gpt-realtime-whisper has
                # no turn_detection, so nothing else triggers a completed event.
                await self._ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
                await asyncio.sleep(1.5)  # let the receive loop process the resulting events
            except websockets.exceptions.ConnectionClosed:
                pass
        if self._receiver_task:
            self._receiver_task.cancel()
        if self._ws:
            await self._ws.close()
        return " ".join(self._transcript_parts)
