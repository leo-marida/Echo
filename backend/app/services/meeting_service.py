import re

import asyncpg
from app.db.client import get_db_pool

# Strip control characters (including NUL, which Postgres TEXT columns reject outright)
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _sanitize_transcript_text(text: str) -> str:
    return _CONTROL_CHARS_RE.sub("", text)


async def create_meeting(title: str | None) -> asyncpg.Record:
    pool = get_db_pool()
    return await pool.fetchrow(
        """
        INSERT INTO meetings (title)
        VALUES ($1)
        RETURNING id, title, status, started_at, ended_at, duration_seconds, created_at, updated_at
        """,
        title,
    )


async def get_meeting(meeting_id: str) -> asyncpg.Record | None:
    pool = get_db_pool()
    return await pool.fetchrow(
        """
        SELECT id, title, status, started_at, ended_at, duration_seconds, created_at, updated_at
        FROM meetings
        WHERE id = $1
        """,
        meeting_id,
    )


async def list_meetings() -> list[asyncpg.Record]:
    pool = get_db_pool()
    return await pool.fetch(
        """
        SELECT id, title, status, started_at, ended_at, duration_seconds, created_at, updated_at
        FROM meetings
        ORDER BY created_at DESC
        """
    )


async def get_meeting_report(meeting_id: str) -> asyncpg.Record | None:
    pool = get_db_pool()
    return await pool.fetchrow(
        """
        SELECT
            m.raw_transcript AS transcript,
            r.summary,
            r.key_decisions,
            r.action_items,
            r.attendees,
            r.topics,
            r.sentiment
        FROM meeting_reports r
        JOIN meetings m ON m.id = r.meeting_id
        WHERE r.meeting_id = $1
        """,
        meeting_id,
    )


async def start_recording(meeting_id: str) -> None:
    pool = get_db_pool()
    await pool.execute(
        """
        UPDATE meetings
        SET status = 'recording', started_at = NOW(), updated_at = NOW()
        WHERE id = $1
        """,
        meeting_id,
    )


async def finish_recording(meeting_id: str) -> None:
    pool = get_db_pool()
    await pool.execute(
        """
        UPDATE meetings
        SET status = 'processing',
            ended_at = NOW(),
            duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - started_at))::int),
            updated_at = NOW()
        WHERE id = $1
        """,
        meeting_id,
    )


async def update_meeting_title(meeting_id: str, title: str) -> asyncpg.Record | None:
    pool = get_db_pool()
    return await pool.fetchrow(
        """
        UPDATE meetings SET title = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING id, title, status, started_at, ended_at, duration_seconds, created_at, updated_at
        """,
        meeting_id,
        title,
    )


async def append_transcript_segment(meeting_id: str, text: str, is_final: bool) -> None:
    pool = get_db_pool()
    await pool.execute(
        """
        INSERT INTO transcript_segments (meeting_id, text, is_final)
        VALUES ($1, $2, $3)
        """,
        meeting_id,
        _sanitize_transcript_text(text),
        is_final,
    )
