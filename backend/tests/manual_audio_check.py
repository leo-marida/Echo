"""
Manual dev utility — NOT a pytest test (pytest won't collect this filename).

Streams a WAV file over the /ws/meetings/{id}/audio WebSocket against a running
backend, exercising the real OpenAI Realtime API. Costs a few cents per run and
requires OPENAI_API_KEY to be set — that's why this isn't part of the automated
suite or CI.

Usage:
    1. Generate a test WAV (Windows built-in TTS), if you don't have one:
       Add-Type -AssemblyName System.Speech
       $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
       $synth.SetOutputToWaveFile("test_speech.wav")
       $synth.Speak("Hello, this is a test of the Echo meeting transcription system.")
       $synth.SetOutputToNull()

    2. Start the backend (in another terminal):
       ./.venv/Scripts/python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8001

    3. Create a meeting and grab its id:
       Invoke-RestMethod -Uri http://localhost:8001/api/v1/meetings -Method Post -ContentType "application/json" -Body '{"title":"Test"}'

    4. Run this script:
       ./.venv/Scripts/python.exe tests/manual_audio_check.py <meeting_id> [--wav test_speech.wav] [--ws-url ws://localhost:8001]

Then check transcript_segments for that meeting_id to confirm it landed.
"""

import argparse
import asyncio
import wave

import numpy as np
import websockets

TARGET_RATE = 24000
CHUNK_MS = 100


def resample_to_pcm16(path: str, target_rate: int) -> bytes:
    w = wave.open(path, "rb")
    raw = w.readframes(w.getnframes())
    orig_rate = w.getframerate()
    data = np.frombuffer(raw, dtype=np.int16)
    if w.getnchannels() > 1:
        data = data.reshape(-1, w.getnchannels()).mean(axis=1).astype(np.int16)
    duration = len(data) / orig_rate
    target_len = int(duration * target_rate)
    orig_idx = np.linspace(0, len(data) - 1, num=len(data))
    target_idx = np.linspace(0, len(data) - 1, num=target_len)
    resampled = np.interp(target_idx, orig_idx, data).astype(np.int16)
    return resampled.tobytes()


async def stream_audio(meeting_id: str, wav_path: str, ws_url: str) -> None:
    pcm = resample_to_pcm16(wav_path, TARGET_RATE)
    chunk_bytes = int(TARGET_RATE * (CHUNK_MS / 1000)) * 2  # 2 bytes/sample
    chunks = [pcm[i:i + chunk_bytes] for i in range(0, len(pcm), chunk_bytes)]
    print(f"Sending {len(chunks)} chunks (~{len(pcm) / TARGET_RATE:.1f}s of audio)")

    uri = f"{ws_url}/ws/meetings/{meeting_id}/audio"
    async with websockets.connect(uri) as ws:
        for chunk in chunks:
            await ws.send(chunk)
            await asyncio.sleep(CHUNK_MS / 1000)
        await ws.send('{"type": "stop"}')
        print("Sent all audio + stop signal, waiting briefly before closing...")
        await asyncio.sleep(3)
    print("DONE")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("meeting_id")
    parser.add_argument("--wav", default="test_speech.wav")
    parser.add_argument("--ws-url", default="ws://localhost:8001")
    args = parser.parse_args()
    asyncio.run(stream_audio(args.meeting_id, args.wav, args.ws_url))
