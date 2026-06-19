# ECHO — Real-Time AI Voice Meeting Copilot
### Claude Code Project Specification · Complete Build Guide · Scratch to Deployment

---

## 0. What Echo Is

Echo is a production-grade, real-time AI voice meeting copilot. A user opens the browser, clicks Record, and speaks. Echo streams their audio over WebSocket to a FastAPI backend, transcribes it live using OpenAI's `gpt-realtime-whisper` model, runs a LangGraph agent in parallel to extract action items and key decisions as the meeting happens, and when the user stops — delivers a structured meeting summary, speaker transcript, and task list to a Next.js dashboard in real time via SSE.

**Why it matters architecturally:**
- Browser WebAudio API captures mic → PCM16 audio chunks → WebSocket to backend
- `gpt-realtime-whisper` streams transcript deltas token-by-token (live captions)
- LangGraph agent runs in parallel: `gpt-4.1-mini` for fast incremental extraction, `gpt-4o` for final deep summary
- Redis pub/sub coordinates the audio processor ↔ agent pipeline (real-time state bridge)
- Full transcript + structured output (action items, decisions, attendees, duration) persisted in Neon Postgres
- SSE streams the final report to the Next.js dashboard the moment analysis completes
- LangSmith traces every agent run

**Live demo flow:** User opens dashboard → clicks "Start Meeting" → speaks → sees live captions appearing word by word → clicks "End Meeting" → within 5 seconds sees: full transcript, action items with owners, key decisions, meeting summary — all on the dashboard.

---

## 1. Project Name

**Echo** — because it captures every word and sends it back structured and actionable.

Resume entry name: **Echo — Real-Time AI Voice Meeting Copilot**

---

## 2. Tech Stack

### AI & Orchestration
| Tool | Purpose | Cost |
|---|---|---|
| `gpt-realtime-whisper` (OpenAI Realtime API) | Live streaming transcription over WebSocket | ~$0.006/min audio |
| `gpt-4.1-mini` | Incremental action item extraction mid-meeting | ~$0.40/1M tokens |
| `gpt-4o` | Deep post-meeting analysis + summary | ~$2.50/1M tokens |
| LangGraph `>=0.2` | Agent state machine, meeting pipeline | Free (OSS) |
| LangChain `>=0.3` | Tool wrappers, prompt templates | Free (OSS) |
| LangSmith | Tracing, evals | Free (5K traces/month) |

### Backend
| Tool | Purpose |
|---|---|
| FastAPI + Python 3.11 | REST API, WebSocket server, SSE |
| `websockets` library | WebSocket server for audio ingestion |
| Neon | Serverless Postgres (free tier) |
| Redis (Render Key Value) | Pub/sub between audio processor and agent |
| `python-multipart` | Audio chunk handling |

### Frontend
| Tool | Purpose |
|---|---|
| Next.js 15 (App Router) | Dashboard |
| TypeScript | Type safety |
| Tailwind CSS v4 | Styling |
| shadcn/ui | Components |
| WebAudio API | Browser mic capture + PCM16 encoding |

### Infrastructure (ALL FREE)
| Service | Purpose | Free Tier |
|---|---|---|
| **Vercel** | Next.js frontend | Hobby — unlimited |
| **Render** | FastAPI + WebSocket backend | Free web service (supports WebSockets) |
| **Neon** | Postgres database | Free (3GB storage, branching, autosuspend) |
| **Render Key Value** | Redis pub/sub | Free tier (data lost on restart — fine for pub/sub) |
| **LangSmith** | Observability | Free Developer (5K traces/month) |
| **GitHub Actions** | CI/CD | Free (2000 min/month) |

> **Render + WebSockets:** Render free tier fully supports WebSocket connections. A new WebSocket connection resets the 15-minute spin-down timer, so the service stays alive during active meetings.

> **Redis on Render:** Use Render's free Key Value instance. Data loss on restart is fine — pub/sub is ephemeral by design. Do NOT use Redis for anything that needs to persist; use Neon Postgres for that.

> **Neon free tier note:** Neon's free plan allows one project per account with autosuspend after ~5 min of inactivity (cold start on next query is sub-second — negligible for this use case). Unlike Supabase, there's no built-in Auth/Storage layer; Echo doesn't use either, so this is a clean swap — `db/client.py` talks to Postgres directly via `asyncpg`, no Supabase SDK or API keys involved.

> **Cost per meeting (30 min):** ~$0.18 audio transcription + ~$0.03 LLM analysis = ~$0.21 total. Your OpenAI credits cover hundreds of demo meetings.

---

## 3. Repository Structure

```
echo/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                      # FastAPI entry point
│   │   ├── config.py                    # Pydantic Settings
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── routes/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── meetings.py          # POST /meetings, GET /meetings, GET/PATCH /meetings/{id}, GET /meetings/{id}/report
│   │   │   │   ├── stream.py            # GET /meetings/{id}/stream (SSE)
│   │   │   │   └── health.py            # GET /health
│   │   │   └── deps.py                  # Dependency injection
│   │   ├── ws/
│   │   │   ├── __init__.py
│   │   │   └── audio_handler.py         # WebSocket endpoint: receives PCM16 audio chunks
│   │   ├── agent/
│   │   │   ├── __init__.py
│   │   │   ├── graph.py                 # LangGraph meeting analysis pipeline
│   │   │   ├── state.py                 # MeetingState TypedDict
│   │   │   └── nodes/
│   │   │       ├── __init__.py
│   │   │       ├── extractor.py         # gpt-4.1-mini: incremental action item extraction
│   │   │       ├── summarizer.py        # gpt-4o: deep meeting summary
│   │   │       ├── structurer.py        # Parse + structure final output
│   │   │       └── persister.py         # Save to Neon Postgres
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── transcription.py         # OpenAI Realtime API WebSocket manager
│   │   │   ├── redis_service.py         # Redis pub/sub client
│   │   │   └── meeting_service.py       # Business logic
│   │   ├── db/
│   │   │   ├── __init__.py
│   │   │   └── client.py                # Postgres async client (asyncpg, Neon-hosted)
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── audio.py                 # PCM16 validation, chunking helpers
│   │       └── streaming.py             # SSE event formatter
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_audio_handler.py
│   │   ├── test_agent.py
│   │   └── test_api.py
│   ├── pyproject.toml
│   ├── requirements.txt
│   ├── .env.example
│   └── Dockerfile
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                     # Landing + start meeting CTA
│   │   ├── meetings/
│   │   │   ├── page.tsx                 # Meeting list / history
│   │   │   └── [meetingId]/
│   │   │       └── page.tsx             # Live meeting view + final report
│   │   └── api/
│   │       └── health/
│   │           └── route.ts             # Proxy health check
│   ├── components/
│   │   ├── ui/                          # shadcn/ui components
│   │   ├── meeting-recorder.tsx         # Mic capture + WebSocket sender
│   │   ├── live-transcript.tsx          # Real-time caption display
│   │   ├── meeting-report.tsx           # Final structured output
│   │   ├── action-item-list.tsx         # Action items with owners
│   │   ├── meeting-card.tsx             # History list item
│   │   └── status-indicator.tsx         # Connection + recording state
│   ├── hooks/
│   │   ├── use-audio-recorder.ts        # WebAudio API + PCM16 encoding
│   │   ├── use-meeting-socket.ts        # WebSocket connection manager
│   │   └── use-meeting-stream.ts        # SSE hook for final report
│   ├── lib/
│   │   ├── api.ts                       # Typed API client
│   │   ├── audio-utils.ts               # Float32 → PCM16 conversion
│   │   └── types.ts                     # Shared TypeScript types
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
├── .github/
│   └── workflows/
│       ├── backend-ci.yml
│       └── frontend-ci.yml
├── docker-compose.yml                   # Local dev stack
├── .env.example
└── README.md
```

---

## 4. Environment Variables

### Backend `.env`
```env
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_REALTIME_MODEL=gpt-realtime-whisper
OPENAI_FAST_MODEL=gpt-4.1-mini
OPENAI_SMART_MODEL=gpt-4o

# Neon Postgres
DATABASE_URL=postgresql+asyncpg://<user>:<password>@<host>.neon.tech/<dbname>?ssl=require

# Redis (Render Key Value)
REDIS_URL=redis://xxxx.render.com:6379

# LangSmith
LANGSMITH_API_KEY=ls__...
LANGSMITH_PROJECT=echo
LANGCHAIN_TRACING_V2=true

# App
API_SECRET_KEY=<openssl rand -hex 32>
CORS_ORIGINS=http://localhost:3000,https://echo-frontend.vercel.app
ENVIRONMENT=development

# Audio
AUDIO_SAMPLE_RATE=24000
AUDIO_CHUNK_DURATION_MS=100
```

### Frontend `.env.local`
```env
NEXT_PUBLIC_API_URL=http://localhost:8000        # dev
NEXT_PUBLIC_WS_URL=ws://localhost:8000           # dev
# NEXT_PUBLIC_API_URL=https://echo-api.onrender.com
# NEXT_PUBLIC_WS_URL=wss://echo-api.onrender.com
```

---

## 5. Database Schema (Neon SQL Editor)

```sql
-- Meetings table
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  -- status: idle | recording | processing | complete | failed
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  raw_transcript TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transcript segments (live captions as they come in)
CREATE TABLE transcript_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_final BOOLEAN NOT NULL DEFAULT FALSE,
  timestamp_offset_ms INTEGER,          -- ms from meeting start
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Meeting reports (final structured output)
CREATE TABLE meeting_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  key_decisions JSONB NOT NULL DEFAULT '[]',
  action_items JSONB NOT NULL DEFAULT '[]',
  -- action_items: [{id, text, owner, due_date, priority}]
  attendees JSONB NOT NULL DEFAULT '[]',
  topics JSONB NOT NULL DEFAULT '[]',
  sentiment TEXT,                        -- positive | neutral | negative
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_transcript_segments_meeting ON transcript_segments(meeting_id);
CREATE INDEX idx_transcript_segments_final ON transcript_segments(meeting_id, is_final);
CREATE INDEX idx_meetings_status ON meetings(status);
CREATE INDEX idx_meetings_created ON meetings(created_at DESC);

-- RLS
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_reports ENABLE ROW LEVEL SECURITY;
```

---

## 6. Backend Implementation

### 6.1 Config (`app/config.py`)

```python
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

# pydantic-settings parses .env into our own Settings object but never writes to
# os.environ — which is what the LangSmith tracer (and any other env-var-reading
# library) actually checks. Loading here, not just in main.py, means any entry
# point that imports app.config (scripts, tests, the API) gets this for free.
load_dotenv()

class Settings(BaseSettings):
    OPENAI_API_KEY: str
    OPENAI_REALTIME_MODEL: str = "gpt-realtime-whisper"
    OPENAI_FAST_MODEL: str = "gpt-4.1-mini"
    OPENAI_SMART_MODEL: str = "gpt-4o"

    DATABASE_URL: str

    REDIS_URL: str = "redis://localhost:6379"

    LANGSMITH_API_KEY: str = ""
    LANGSMITH_PROJECT: str = "echo"
    LANGCHAIN_TRACING_V2: bool = False

    API_SECRET_KEY: str
    CORS_ORIGINS: str = "http://localhost:3000"  # comma-separated; see cors_origins_list
    ENVIRONMENT: str = "development"

    AUDIO_SAMPLE_RATE: int = 24000
    AUDIO_CHUNK_DURATION_MS: int = 100

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()
# Note: CORS_ORIGINS is kept as a plain comma-separated str rather than List[str] —
# pydantic-settings==2.4.0 JSON-decodes complex env types before validators run,
# which breaks on a comma-separated value. cors_origins_list derives the list at use time.
# Note: model_config uses pydantic-settings' SettingsConfigDict (not plain pydantic
# ConfigDict) — env_file is a pydantic-settings-specific key, and the old `class Config`
# style is deprecated in Pydantic v2.
```

### 6.2 FastAPI Entry Point (`app/main.py`)

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api.routes import meetings, stream, health
from app.ws.audio_handler import router as ws_router
from app.db.client import init_db, close_db
from app.services.redis_service import init_redis, close_redis

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await init_redis()
    yield
    await close_redis()
    await close_db()

app = FastAPI(
    title="Echo API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["health"])
app.include_router(meetings.router, prefix="/api/v1", tags=["meetings"])
app.include_router(stream.router, prefix="/api/v1", tags=["stream"])
app.include_router(ws_router, tags=["websocket"])
```

### 6.3 LangGraph State (`app/agent/state.py`)

```python
from typing import TypedDict, List, Optional
from langgraph.graph.message import add_messages
from typing import Annotated

class ActionItem(TypedDict):
    id: str
    text: str
    owner: Optional[str]
    priority: str        # high | medium | low

class MeetingState(TypedDict):
    meeting_id: str
    raw_transcript: str
    segments: List[str]  # Transcript chunks as they arrived

    # Extracted content
    action_items: List[ActionItem]
    key_decisions: List[str]
    attendees: List[str]
    topics: List[str]
    summary: Optional[str]
    sentiment: Optional[str]

    # Pipeline control
    current_node: str
    error: Optional[str]
    stream_tokens: Annotated[List[str], add_messages]
```

### 6.4 LangGraph Agent (`app/agent/graph.py`)

```python
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from app.agent.state import MeetingState
from app.agent.nodes import extractor, summarizer, structurer, persister

def build_echo_graph():
    graph = StateGraph(MeetingState)

    graph.add_node("extractor", extractor.run)
    graph.add_node("summarizer", summarizer.run)
    graph.add_node("structurer", structurer.run)
    graph.add_node("persister", persister.run)

    graph.set_entry_point("extractor")
    graph.add_edge("extractor", "summarizer")
    graph.add_edge("summarizer", "structurer")
    graph.add_edge("structurer", "persister")
    graph.add_edge("persister", END)

    return graph.compile(checkpointer=MemorySaver())

echo_graph = build_echo_graph()
```

### 6.5 Extractor Node (`app/agent/nodes/extractor.py`)

```python
"""
gpt-4.1-mini: fast incremental extraction of action items and decisions.
Runs once per meeting on the full transcript. Cost: fractions of a cent.
"""
from openai import AsyncOpenAI
from app.config import settings
from app.agent.state import MeetingState, ActionItem
import json
import uuid
# ruff E401: one import per line (single-line `import json, uuid` failed `ruff check .` in CI)

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

EXTRACT_SYSTEM = """You are a meeting analyst. From the transcript extract:
1. Action items — tasks assigned to people. Include owner name if mentioned.
2. Key decisions — conclusions the group reached.
3. Attendees — names mentioned or referred to as participants.
4. Topics discussed — main subjects (3-6 bullet points max).

Return ONLY valid JSON:
{
  "action_items": [{"text": "...", "owner": "name or null", "priority": "high|medium|low"}],
  "key_decisions": ["..."],
  "attendees": ["..."],
  "topics": ["..."]
}"""

async def run(state: MeetingState) -> dict:
    if not state["raw_transcript"].strip():
        return {
            "action_items": [], "key_decisions": [],
            "attendees": [], "topics": [], "current_node": "extractor"
        }

    response = await client.chat.completions.create(
        model=settings.OPENAI_FAST_MODEL,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": EXTRACT_SYSTEM},
            {"role": "user", "content": f"Transcript:\n\n{state['raw_transcript']}"},
        ],
        max_tokens=1500,
    )

    data = json.loads(response.choices[0].message.content)

    action_items: list[ActionItem] = [
        ActionItem(
            id=str(uuid.uuid4()),
            text=item["text"],
            owner=item.get("owner"),
            priority=item.get("priority", "medium"),
        )
        for item in data.get("action_items", [])
    ]

    return {
        "action_items": action_items,
        "key_decisions": data.get("key_decisions", []),
        "attendees": data.get("attendees", []),
        "topics": data.get("topics", []),
        "current_node": "extractor",
    }
```

### 6.6 Summarizer Node (`app/agent/nodes/summarizer.py`)

```python
"""
gpt-4o: deep meeting summary with sentiment.
Only runs once at meeting end — cost is minimal (~$0.01-0.03 per meeting).
"""
from openai import AsyncOpenAI
from app.config import settings
from app.agent.state import MeetingState

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

SUMMARIZE_SYSTEM = """You are an expert meeting summarizer.
Write a clear, professional meeting summary (3-5 sentences).
Then assess overall sentiment: positive, neutral, or negative.

Return ONLY valid JSON:
{"summary": "...", "sentiment": "positive|neutral|negative"}"""

async def run(state: MeetingState) -> dict:
    if not state["raw_transcript"].strip():
        return {"summary": "No transcript available.", "sentiment": "neutral", "current_node": "summarizer"}

    response = await client.chat.completions.create(
        model=settings.OPENAI_SMART_MODEL,
        temperature=0.3,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SUMMARIZE_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"Transcript:\n{state['raw_transcript']}\n\n"
                    f"Action items found: {len(state['action_items'])}\n"
                    f"Key decisions: {', '.join(state['key_decisions'][:3]) if state['key_decisions'] else 'none'}"
                ),
            },
        ],
        max_tokens=600,
    )

    import json
    data = json.loads(response.choices[0].message.content)
    return {
        "summary": data.get("summary", ""),
        "sentiment": data.get("sentiment", "neutral"),
        "current_node": "summarizer",
    }
```

### 6.7 Structurer Node (`app/agent/nodes/structurer.py`)

Not specified in the original spec beyond "parse + validate structured output" — implemented as a
guardrail pass between summarizer and persister: normalizes priority/sentiment enums against
malformed LLM output, and dedupes key_decisions/attendees/topics.

```python
"""
Validates and normalizes extractor/summarizer output before persistence —
a guardrail against malformed LLM output reaching the database.
"""
from app.agent.state import MeetingState

VALID_PRIORITIES = {"high", "medium", "low"}
VALID_SENTIMENTS = {"positive", "neutral", "negative"}


def _dedupe(items: list[str]) -> list[str]:
    seen = set()
    result = []
    for item in items:
        key = item.strip().lower()
        if key and key not in seen:
            seen.add(key)
            result.append(item.strip())
    return result


async def run(state: MeetingState) -> dict:
    try:
        action_items = []
        for item in state["action_items"]:
            priority = str(item.get("priority", "medium")).lower()
            action_items.append({
                **item,
                "priority": priority if priority in VALID_PRIORITIES else "medium",
            })

        sentiment = (state.get("sentiment") or "neutral").lower()
        if sentiment not in VALID_SENTIMENTS:
            sentiment = "neutral"

        return {
            "action_items": action_items,
            "key_decisions": _dedupe(state["key_decisions"]),
            "attendees": _dedupe(state["attendees"]),
            "topics": _dedupe(state["topics"]),
            "summary": (state.get("summary") or "").strip() or "No summary available.",
            "sentiment": sentiment,
            "current_node": "structurer",
            "error": None,
        }
    except Exception as exc:
        return {"current_node": "structurer", "error": str(exc)}
```

### 6.8 Persister Node (`app/agent/nodes/persister.py`)

Not specified in the original spec beyond "Save to Neon Postgres" — writes the structured report
to `meeting_reports` (upsert on `meeting_id`, which is UNIQUE), then marks the meeting `complete`
(or `failed` on error, matching the documented `meetings.status` enum from Section 5). Also writes
`raw_transcript` back onto the `meetings` row — without this, there'd be no way to retrieve a
completed meeting's transcript/report later (e.g. from the history page); the live flow gets the
report inline via the SSE `done` event, but revisiting an old meeting needs it persisted somewhere.
Paired with a new `GET /api/v1/meetings/{id}/report` endpoint (joins `meetings.raw_transcript` with
`meeting_reports`) — also pulled forward from Phase 7 for the same reason as the list endpoint.

```python
"""
Writes the final structured report to Neon Postgres and marks the meeting complete.
"""
import json

from app.agent.state import MeetingState
from app.db.client import get_db_pool


async def run(state: MeetingState) -> dict:
    pool = get_db_pool()
    try:
        await pool.execute(
            """
            INSERT INTO meeting_reports (meeting_id, summary, key_decisions, action_items, attendees, topics, sentiment)
            VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7)
            ON CONFLICT (meeting_id) DO UPDATE SET
                summary = EXCLUDED.summary,
                key_decisions = EXCLUDED.key_decisions,
                action_items = EXCLUDED.action_items,
                attendees = EXCLUDED.attendees,
                topics = EXCLUDED.topics,
                sentiment = EXCLUDED.sentiment
            """,
            state["meeting_id"],
            state["summary"],
            json.dumps(state["key_decisions"]),
            json.dumps(state["action_items"]),
            json.dumps(state["attendees"]),
            json.dumps(state["topics"]),
            state["sentiment"],
        )
        await pool.execute(
            """
            UPDATE meetings
            SET status = 'complete', raw_transcript = $2, updated_at = NOW()
            WHERE id = $1
            """,
            state["meeting_id"],
            state["raw_transcript"],
        )
        return {"current_node": "persister", "error": None}
    except Exception as exc:
        await pool.execute(
            "UPDATE meetings SET status = 'failed', updated_at = NOW() WHERE id = $1",
            state["meeting_id"],
        )
        return {"current_node": "persister", "error": str(exc)}
```

### 6.9 WebSocket Audio Handler (`app/ws/audio_handler.py`)

`update_meeting_status` was replaced with `start_recording`/`finish_recording` — the original
design never actually set `started_at`/`ended_at`/`duration_seconds` anywhere despite them being
in the Section 5 schema, so the report page's duration badge would always be empty. `start_recording`
sets `started_at` when the WS connects; `finish_recording` sets `ended_at` and computes
`duration_seconds` from the elapsed time when it closes.

```python
"""
Receives raw PCM16 audio from the browser over WebSocket.
Forwards chunks to OpenAI Realtime API for live transcription.
Publishes transcript deltas to Redis for the SSE stream.
"""
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.transcription import TranscriptionSession
from app.services.redis_service import get_redis
from app.services.meeting_service import start_recording, finish_recording, append_transcript_segment, get_meeting
from app.utils.audio import is_valid_pcm16_chunk
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Section 11: max 1 active recording per IP at a time. In-memory is fine —
# Render free tier runs a single instance, and this state is not meant to persist.
_active_recording_ips: set[str] = set()

@router.websocket("/ws/meetings/{meeting_id}/audio")
async def audio_websocket(websocket: WebSocket, meeting_id: str):
    # Section 11: validate meeting_id exists before accepting audio
    meeting = await get_meeting(meeting_id)
    if meeting is None:
        await websocket.close(code=4404)
        return

    # Section 11: rate limit — max 1 active recording per IP
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

        # Single receive loop, dispatched by message type. The original two-task
        # design (one calling receive_bytes(), one calling receive_text()) races
        # on the same underlying ASGI receive channel — a binary chunk can be
        # delivered to the text-only reader, which then crashes on KeyError('text').
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break

            data = message.get("bytes")
            if data is not None:
                if not is_valid_pcm16_chunk(data):  # Section 11 audio size guard
                    logger.warning("Dropping invalid/oversized PCM16 chunk (%d bytes)", len(data))
                    continue
                await session.send_audio(data)
                continue

            text = message.get("text")
            if text is not None:
                payload = json.loads(text)
                if payload.get("type") == "stop":
                    break  # Signal to end the session

    except WebSocketDisconnect:
        pass
    finally:
        _active_recording_ips.discard(client_ip)
        full_transcript = await session.close()  # close() forces a final commit + flush, see Section 6.10
        await finish_recording(meeting_id)
        # Publish end event — SSE stream picks this up and triggers agent
        await redis.publish(
            f"meeting:{meeting_id}:transcript",
            json.dumps({"type": "recording_ended", "meeting_id": meeting_id, "transcript": full_transcript}),
        )
```

### 6.10 Transcription Service (`app/services/transcription.py`)

```python
"""
Manages a WebSocket connection to OpenAI's Realtime API for live transcription.
Uses gpt-realtime-whisper which emits transcript deltas while the speaker talks.
"""
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
        # GA Realtime API: the ?intent=transcription URL shape is still correct in GA —
        # it was the OpenAI-Beta header (and pairing it with a model= param) that triggered
        # beta_api_shape_disabled / invalid_model errors. Confirmed against the live API:
        # connecting with intent=transcription and NO model param and NO beta header
        # returns session.created -> session.updated correctly.
        url = "wss://api.openai.com/v1/realtime?intent=transcription"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
        }
        self._ws = await websockets.connect(url, extra_headers=headers)
        # Note: websockets==13.0's top-level connect() resolves to the legacy client,
        # whose header kwarg is extra_headers (additional_headers is the newer asyncio-native client's name).

        await self._ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "type": "transcription",
                "audio": {
                    "input": {
                        "format": {"type": "audio/pcm", "rate": settings.AUDIO_SAMPLE_RATE},
                        "transcription": {"model": self.model},
                        # gpt-realtime-whisper is a pure continuous-streaming model and
                        # rejects turn_detection outright ("not supported for this
                        # transcription model") — see close() for how we finalize the
                        # transcript without relying on a completed event for the text.
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
```

### 6.11 SSE Stream (`app/api/routes/stream.py`)

```python
"""
SSE endpoint. Subscribes to Redis pub/sub channel for the meeting.
Streams transcript deltas live, then triggers LangGraph agent when recording ends,
then streams the final structured report.
"""
import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.services.redis_service import get_redis
from app.agent.graph import echo_graph
from app.agent.state import MeetingState

router = APIRouter()

async def meeting_event_generator(meeting_id: str):
    redis = get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(f"meeting:{meeting_id}:transcript")

    try:
        yield f"data: {json.dumps({'type': 'connected', 'meeting_id': meeting_id})}\n\n"

        full_transcript = []

        async for message in pubsub.listen():
            if message["type"] != "message":
                continue

            event = json.loads(message["data"])
            event_type = event.get("type")

            if event_type == "transcript_delta":
                yield f"data: {json.dumps({'type': 'caption', 'text': event['text'], 'is_final': event['is_final']})}\n\n"
                if event["is_final"]:
                    full_transcript.append(event["text"])

            elif event_type == "recording_ended":
                yield f"data: {json.dumps({'type': 'processing', 'message': 'Analyzing meeting...'})}\n\n"

                # Run LangGraph agent
                transcript_text = event.get("transcript", " ".join(full_transcript))
                config = {"configurable": {"thread_id": meeting_id}}

                initial_state = MeetingState(
                    meeting_id=meeting_id,
                    raw_transcript=transcript_text,
                    segments=full_transcript,
                    action_items=[],
                    key_decisions=[],
                    attendees=[],
                    topics=[],
                    summary=None,
                    sentiment=None,
                    current_node="start",
                    error=None,
                    stream_tokens=[],
                )

                final_state = await echo_graph.ainvoke(initial_state, config=config)

                # Stream final report
                report = {
                    "type": "report",
                    "summary": final_state["summary"],
                    "action_items": final_state["action_items"],
                    "key_decisions": final_state["key_decisions"],
                    "attendees": final_state["attendees"],
                    "topics": final_state["topics"],
                    "sentiment": final_state["sentiment"],
                    "transcript": transcript_text,
                }
                yield f"data: {json.dumps({'type': 'done', 'report': report})}\n\n"
                return
    finally:
        # Runs on normal completion AND on early client disconnect (generator gets
        # cancelled by Starlette) — the original only unsubscribed on the success path.
        await pubsub.unsubscribe()
        await pubsub.aclose()

@router.get("/meetings/{meeting_id}/stream")
async def stream_meeting(meeting_id: str):
    return StreamingResponse(
        meeting_event_generator(meeting_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
```

---

## 7. Frontend Implementation

### 7.1 Audio Recorder Hook (`frontend/hooks/use-audio-recorder.ts`)

```typescript
import { useRef, useState, useCallback } from "react";

const SAMPLE_RATE = 24000;
const CHUNK_INTERVAL_MS = 100;

function float32ToPCM16(float32Array: Float32Array): ArrayBuffer {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16.buffer;
}

export function useAudioRecorder(onChunk: (pcm16: ArrayBuffer) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    streamRef.current = stream;

    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    contextRef.current = ctx;

    const source = ctx.createMediaStreamSource(stream);
    // ScriptProcessorNode fires every bufferSize samples
    const bufferSize = Math.floor((SAMPLE_RATE * CHUNK_INTERVAL_MS) / 1000);
    const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      const float32 = e.inputBuffer.getChannelData(0);
      const pcm16 = float32ToPCM16(float32);
      onChunk(pcm16);
    };

    source.connect(processor);
    processor.connect(ctx.destination);
    setIsRecording(true);
  }, [onChunk]);

  const stop = useCallback(() => {
    processorRef.current?.disconnect();
    contextRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setIsRecording(false);
  }, []);

  return { isRecording, start, stop };
}
```

### 7.2 Meeting Socket Hook (`frontend/hooks/use-meeting-socket.ts`)

```typescript
import { useRef, useCallback, useState } from "react";

type SocketStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export function useMeetingSocket(meetingId: string | null) {
  const [status, setStatus] = useState<SocketStatus>("idle");
  const socketRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!meetingId) return;
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    const ws = new WebSocket(`${wsUrl}/ws/meetings/${meetingId}/audio`);
    socketRef.current = ws;

    ws.onopen = () => setStatus("connected");
    ws.onclose = () => setStatus("disconnected");
    ws.onerror = () => setStatus("error");

    return ws;
  }, [meetingId]);

  const sendAudio = useCallback((pcm16: ArrayBuffer) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(pcm16);
    }
  }, []);

  const sendStop = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "stop" }));
    }
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.close();
  }, []);

  return { status, connect, sendAudio, sendStop, disconnect };
}
```

### 7.3 Meeting Stream Hook (`frontend/hooks/use-meeting-stream.ts`)

Listed in Section 3's tree but never given explicit code in the original spec — same gap as
`structurer.py`/`persister.py` on the backend. Designed against the actual `MeetingSSEEvent` shape
and what Phase 5 testing showed about how the backend really emits captions: non-final deltas
arrive as individual word/punctuation fragments that accumulate into one running "partial" line,
and there is effectively only ONE final caption per meeting (sent once, at the very end, containing
the whole transcript) — because `gpt-realtime-whisper` has no turn detection, so the backend only
ever commits/finalizes once, on `TranscriptionSession.close()`. The live transcript UI is designed
around that reality: a single growing in-progress line during recording, which then becomes one
completed line right before `processing` begins.

Also adds the `isStale` flag for the "Still analyzing..." reassurance state (Section 6 loading states:
no event for 30s while `processing`), and relies on `EventSource`'s native auto-reconnect for
transport-level drops rather than hand-rolling backoff — SSE already retries on its own; the explicit
exponential-backoff requirement in the design brief is about the audio WebSocket, not this hook.

```typescript
import { useEffect, useRef, useState, useCallback } from "react";
import type { MeetingReport, MeetingSSEEvent } from "@/lib/types";

type StreamStatus = "idle" | "connecting" | "connected" | "error";

export interface TranscriptSegment {
  text: string;
  timestamp: number; // ms since stream connected
}

const STALE_THRESHOLD_MS = 30_000;
const STALE_CHECK_INTERVAL_MS = 5_000;

export function useMeetingStream(meetingId: string | null) {
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [partial, setPartial] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [report, setReport] = useState<MeetingReport | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const startedAtRef = useRef<number>(0);
  const lastEventAtRef = useRef<number>(0);

  useEffect(() => {
    if (!meetingId) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    const es = new EventSource(`${apiUrl}/api/v1/meetings/${meetingId}/stream`);
    eventSourceRef.current = es;
    startedAtRef.current = Date.now();
    lastEventAtRef.current = Date.now();
    setStatus("connecting");

    es.onmessage = (raw) => {
      lastEventAtRef.current = Date.now();
      setIsStale(false);

      let event: MeetingSSEEvent;
      try {
        event = JSON.parse(raw.data);
      } catch {
        return;
      }

      switch (event.type) {
        case "connected":
          setStatus("connected");
          break;
        case "caption":
          if (event.is_final) {
            setSegments((prev) => [
              ...prev,
              { text: event.text, timestamp: Date.now() - startedAtRef.current },
            ]);
            setPartial("");
          } else {
            setPartial((prev) => prev + event.text);
          }
          break;
        case "processing":
          setIsProcessing(true);
          break;
        case "done":
          setIsProcessing(false);
          setReport(event.report);
          es.close();
          break;
        case "error":
          setError(event.message);
          break;
      }
    };

    // EventSource retries automatically on transport-level drops; we only
    // surface connection state here — never a raw error to the UI.
    es.onerror = () => {
      setStatus(es.readyState === EventSource.CONNECTING ? "connecting" : "error");
    };

    const staleCheck = setInterval(() => {
      if (isProcessing && Date.now() - lastEventAtRef.current > STALE_THRESHOLD_MS) {
        setIsStale(true);
      }
    }, STALE_CHECK_INTERVAL_MS);

    return () => {
      clearInterval(staleCheck);
      es.close();
      eventSourceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  const reset = useCallback(() => {
    setSegments([]);
    setPartial("");
    setIsProcessing(false);
    setReport(null);
    setIsStale(false);
    setError(null);
  }, []);

  return { status, segments, partial, isProcessing, report, isStale, error, reset };
}
```

### 7.4 Shared TypeScript Types (`frontend/lib/types.ts`)

```typescript
export interface ActionItem {
  id: string;
  text: string;
  owner: string | null;
  priority: "high" | "medium" | "low";
}

export interface MeetingReport {
  summary: string;
  action_items: ActionItem[];
  key_decisions: string[];
  attendees: string[];
  topics: string[];
  sentiment: "positive" | "neutral" | "negative";
  transcript: string;
}

export interface Meeting {
  id: string;
  title: string | null;
  status: "idle" | "recording" | "processing" | "complete" | "failed";
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export type MeetingSSEEvent =
  | { type: "connected"; meeting_id: string }
  | { type: "caption"; text: string; is_final: boolean }
  | { type: "processing"; message: string }
  | { type: "done"; report: MeetingReport }
  | { type: "error"; message: string };
```

---

## 8. Python Dependencies (`backend/requirements.txt`)

```txt
# Web framework
fastapi==0.115.0
uvicorn[standard]==0.30.0
pydantic==2.8.0
pydantic-settings==2.4.0
python-multipart==0.0.9

# AI / LangGraph
openai==1.45.0
langchain==0.3.0
langchain-openai==0.2.0
langgraph==0.2.20
langsmith==0.1.147

# WebSockets (for OpenAI Realtime API connection)
websockets==13.0

# Database (Neon Postgres)
asyncpg==0.29.0

# Redis
redis[asyncio]==5.0.8

# Utilities
httpx==0.27.0
python-dotenv==1.0.1
tenacity==8.5.0

# Dev / testing
pytest==8.3.0
pytest-asyncio==0.24.0
pytest-cov==5.0.0
ruff==0.6.0
```

---

## 9. Deployment

### 9.1 Backend → Render (free tier)

1. Push `backend/` to GitHub
2. Render Dashboard → New → Web Service
3. Connect repo, set **Root Directory:** `backend`
4. **Runtime:** Python 3.11 — selecting "Python 3" in Render's dropdown does NOT pin the minor
   version; by 2026 Render's default had drifted to 3.14, which has no prebuilt wheel for
   `pydantic-core==2.20.0` and falls back to compiling it from Rust source, which fails on
   Render's read-only build filesystem. Pin it for real via `backend/.python-version`
   containing `3.11.9` (committed to the repo) — confirmed this actually fixes the build.
5. **Build Command:** `pip install -r requirements.txt`
6. **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
7. Add all env vars from `.env`
8. **Important:** Render free tier supports WebSockets natively. The spin-down timer resets on every new WebSocket connection — the service stays alive during active meetings.
9. Deploy → URL: `https://echo-api.onrender.com`

### 9.2 Redis → Render Key Value

1. Render Dashboard → New → Key Value
2. Select free tier
3. Copy the `REDIS_URL` from Render dashboard → add to backend env vars
4. Note: data is lost on restart — this is fine, pub/sub is ephemeral

### 9.2b Database → Neon

1. Create project at Neon (one free project per account)
2. Run the schema SQL from Section 5 in Neon's SQL Editor
3. Copy the pooled connection string from the Neon dashboard, rewrite the scheme as `postgresql+asyncpg://` and add `?ssl=require`
4. Add as `DATABASE_URL` in Render backend env vars

### 9.3 Frontend → Vercel (free Hobby tier)

1. Push `frontend/` to GitHub
2. Vercel → New Project → Import repo
3. **Root Directory:** `frontend`
4. **Framework Preset:** Next.js
5. Add env vars:
   - `NEXT_PUBLIC_API_URL` = `https://echo-api.onrender.com`
   - `NEXT_PUBLIC_WS_URL` = `wss://echo-api.onrender.com`
6. Deploy → URL: `https://echo-frontend.vercel.app`

### 9.4 GitHub Actions CI (`backend-ci.yml`)

```yaml
name: Backend CI
on:
  push:
    branches: [main]
    paths: ["backend/**"]
  pull_request:
    paths: ["backend/**"]
jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: "pip"
      - run: pip install -r requirements.txt
      - run: ruff check .
      - name: Run tests
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          REDIS_URL: redis://localhost:6379
          API_SECRET_KEY: test-secret
        run: pytest tests/ -v --cov=app
```

Note: the `services:` block must be a sibling key of `steps:` under the `test` job (indented under
`test:`, at the same level as `runs-on:`/`defaults:`/`steps:`) — the indentation shown in earlier
drafts of this doc nested it inside the last step instead, which isn't valid GitHub Actions YAML.
Fixed in the actual `.github/workflows/backend-ci.yml`.

Also note: even with no GitHub repo secrets configured at all, this CI passes — `OPENAI_API_KEY`/
`DATABASE_URL` just become empty strings, which satisfy `Settings`' plain `str` type (no connection
is ever attempted; nothing in `tests/` currently exercises real I/O, see Section 9.5).

### 9.5 GitHub Actions CI (`frontend-ci.yml`)

Not specified in the original spec at all — designed to mirror the backend CI's shape (typecheck +
lint + build, no deploy). Verified locally before committing: `npx tsc --noEmit`, `npm run lint`,
and `npm run build` all pass cleanly (the production build correctly generates all 5 routes).

```yaml
name: Frontend CI
on:
  push:
    branches: [main]
    paths: ["frontend/**"]
  pull_request:
    paths: ["frontend/**"]
jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm run build
        env:
          NEXT_PUBLIC_API_URL: http://localhost:8000
          NEXT_PUBLIC_WS_URL: ws://localhost:8000
```

---

## 10. Build Order (Phase by Phase)

Do NOT move to the next phase until the current phase is fully tested and working.

### Phase 1 — Foundation (Day 1)
- [ ] Init monorepo, full folder structure from Section 3
- [ ] `pyproject.toml`, `requirements.txt` installed
- [ ] Neon project created, schema SQL executed, tables verified
- [ ] `config.py`, `main.py`, health endpoint
- [ ] Postgres connection pool verified
- [ ] POST `/api/v1/meetings` creates row → returns `meeting_id`
- [ ] GET `/api/v1/meetings/{id}` returns meeting
- [ ] **Test:** `curl -X POST localhost:8000/api/v1/meetings -d '{"title":"Test"}' | jq`
- [ ] **Test:** Check row appears in Neon's Table view / via `psql`

### Phase 2 — Redis + Pub/Sub (Day 2)
- [ ] Redis service: `init_redis`, `get_redis`, `close_redis`
- [ ] Pub/sub wrapper: `publish(channel, message)`, `subscribe(channel)`
- [ ] Test that backend connects to Redis on startup (log confirmation)
- [ ] **Test:** Manually publish to a channel and verify the subscriber receives it

### Phase 3 — WebSocket Audio Ingestion (Day 3–4)
- [ ] `audio_handler.py` WebSocket endpoint skeleton (accept connection, receive bytes, log chunk size)
- [ ] `transcription.py` TranscriptionSession: connect to OpenAI Realtime API
- [ ] Send a 5-second WAV file over WebSocket (test client script), verify transcript deltas logged to console
- [ ] Wire `on_transcript_delta` → Redis pub/sub publish
- [ ] `update_meeting_status` + `append_transcript_segment` Postgres writes
- [ ] **Test:** Python test client sends audio file, verify transcript appears in `transcript_segments` table
- [ ] **Test:** Redis monitor (`redis-cli monitor`) shows pub/sub events firing

### Phase 4 — LangGraph Analysis Agent (Day 5)
- [ ] `state.py`: MeetingState TypedDict
- [ ] `extractor.py`: gpt-4.1-mini action item extraction, test with dummy transcript
- [ ] `summarizer.py`: gpt-4o summary + sentiment
- [ ] `structurer.py`: parse + validate structured output
- [ ] `persister.py`: write report to `meeting_reports` table in Neon Postgres
- [ ] `graph.py`: wire all nodes, compile
- [ ] **Test:** Invoke graph manually with a fake transcript → verify `meeting_reports` row created
- [ ] **Test:** Check LangSmith dashboard shows trace

### Phase 5 — SSE Stream (Day 6)
- [ ] `stream.py` SSE endpoint: subscribes to Redis, forwards transcript deltas
- [ ] End-of-recording event triggers LangGraph agent
- [ ] Final report streamed as `done` event
- [ ] **Test:** `curl -N localhost:8000/api/v1/meetings/{id}/stream` while WebSocket sends audio
- [ ] Verify: captions stream live, then `processing`, then `done` with full report
- [ ] **Test:** Full end-to-end backend flow — audio in → transcript deltas → agent → report out

### Phase 6 — Frontend (Day 7–9)
- [ ] Next.js 15 scaffold + Tailwind + shadcn/ui
- [ ] `audio-utils.ts`: Float32 → PCM16 conversion utility
- [ ] `use-audio-recorder.ts` hook: mic capture, PCM16 chunks
- [ ] `use-meeting-socket.ts` hook: WebSocket connection, send audio chunks
- [ ] `use-meeting-stream.ts` hook: SSE consumer
- [ ] Landing page: "Start Meeting" button, mic permission request
- [ ] Live meeting page: recording controls + live transcript display
- [ ] Report page: summary card, action items list, decisions, topics
- [ ] Meetings history page (moved up from Phase 7 per design brief — needs `GET /api/v1/meetings`, pulled forward too)
- [ ] Render cold-start: show "Warming up server..." on connection error, retry after 3s
- [ ] **Test:** Full UI flow in browser — record 60 seconds → stop → see report appear
- [ ] **Test:** Mobile browser test (Chrome on Android/iOS)

### Phase 7 — Deploy + Polish (Day 10)
- [x] `PATCH /api/v1/meetings/{id}` for title update — pulled forward into Phase 6, report page needs inline rename
- [x] GET `/api/v1/meetings` returns list of past meetings — pulled forward into Phase 6, the history page needed it
- [x] Meetings history page — pulled forward into Phase 6 per design brief
- [ ] GitHub Actions CI pipeline
- [ ] Deploy Redis Key Value on Render
- [ ] Deploy backend to Render, verify WebSocket + SSE work cross-origin
- [ ] Deploy frontend to Vercel, verify CORS + wss:// connection works
- [ ] Enable LangSmith env vars, run one production meeting, verify trace in dashboard
- [ ] Write README with architecture diagram + demo GIF
- [ ] Update resume with live link

---

## 11. Security Best Practices

- Never send `OPENAI_API_KEY` to the frontend — all AI calls backend-only
- Validate WebSocket connections: check `meeting_id` exists in DB before accepting audio
- Rate limit WebSocket connections: max 1 active recording per IP at a time
- Sanitize transcript text before storing: strip potential injection characters
- CORS: explicit origin list, never `*`
- Audio size guard: if PCM16 chunk exceeds expected size (>10KB per 100ms), drop it
- Environment: `DATABASE_URL` (Neon connection string) backend-only, never in frontend env
- `.gitignore` must include `.env*` before first commit
- Add `Content-Security-Policy` header in Next.js config

---

## 12. Cost per Meeting

| Item | 30-min meeting | Cost |
|---|---|---|
| `gpt-realtime-whisper` | 30 min audio | ~$0.18 |
| `gpt-4.1-mini` (extractor) | ~3K tokens | ~$0.002 |
| `gpt-4o` (summarizer) | ~1.5K tokens | ~$0.008 |
| Neon storage | ~50KB | Free |
| **Total** | | **~$0.19** |

Your OpenAI credits cover 500+ demo meetings.

---

## 13. Resume Entry

**Project title:** Echo — Real-Time AI Voice Meeting Copilot

**Tech stack line:**
`OpenAI Realtime API (gpt-realtime-whisper), WebSockets, LangGraph, gpt-4.1-mini, gpt-4o, FastAPI, Redis, PostgreSQL (Neon), SSE Streaming, Next.js, TypeScript, Docker, GitHub Actions, Vercel, Render`

**One-sentence bullet:**
Built Echo, a real-time AI voice meeting copilot that streams browser mic audio over WebSocket to a FastAPI backend for live transcription via OpenAI's `gpt-realtime-whisper`, runs a LangGraph agent pipeline using dual-LLM routing (gpt-4.1-mini for incremental extraction, gpt-4o for deep analysis) to produce structured action items, decisions, and a meeting summary — streamed back to a Next.js dashboard via SSE the moment the meeting ends.

---

## 14. New Skills to Add to Resume After Echo

Add to **AI & Automation:**
- `OpenAI Realtime API`
- `WebRTC / WebAudio API`

Add to **Backend & APIs:**
- `Redis Pub/Sub`
- `WebSocket (server + client)`  ← already listed, but now proven in a major project

Add to **AI Developer Tools:**
- confirm `LangSmith` already listed ✓

These additions, combined with Sentinel, give your skills section complete coverage of every major 2026 AI engineering category: agents, RAG, DevSecOps AI, and real-time voice AI.

---

## 15. ArcVault Resume Fix (do this now, takes 30 seconds)

Current bullet (has one problem):
> "Production-ready AI triage system **built for a technical assessment**; ingests support tickets..."

Fixed bullet (remove the 4 bold words, replace with nothing):
> "Production-ready AI triage system that ingests support tickets via FastAPI, classifies urgency and routes to the correct handler using a LangChain + OpenAI pipeline, with full audit logging to PostgreSQL — achieving sub-300ms end-to-end latency in load tests."

---

*Generated by Claude · Echo Project Specification v1.0*
