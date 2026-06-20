import re

import asyncpg
from app.db.client import get_db_pool

# Strip control characters (including NUL, which Postgres TEXT columns reject outright)
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _sanitize_transcript_text(text: str) -> str:
    return _CONTROL_CHARS_RE.sub("", text)


async def create_meeting(title: str | None, user_id: str | None = None) -> asyncpg.Record:
    pool = get_db_pool()
    return await pool.fetchrow(
        """
        INSERT INTO meetings (title, user_id)
        VALUES ($1, $2)
        RETURNING id, title, status, started_at, ended_at, duration_seconds, created_at, updated_at
        """,
        title,
        user_id,
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


async def list_meetings(user_id: str) -> list[asyncpg.Record]:
    """Scoped to a single user — there is no "list all meetings" mode. Anonymous
    (no-account) meetings have no owner and are never returned by this; they exist
    only as direct links, not in anyone's history.
    """
    pool = get_db_pool()
    return await pool.fetch(
        """
        SELECT id, title, status, started_at, ended_at, duration_seconds, created_at, updated_at
        FROM meetings
        WHERE user_id = $1
        ORDER BY created_at DESC
        """,
        user_id,
    )


async def delete_meeting(meeting_id: str, user_id: str) -> bool:
    """Ownership-checked delete ("discard") — returns False if the meeting doesn't
    exist or isn't owned by this user, so callers can return 404 either way without
    leaking which case it was.
    """
    pool = get_db_pool()
    result = await pool.execute(
        "DELETE FROM meetings WHERE id = $1 AND user_id = $2",
        meeting_id,
        user_id,
    )
    return result == "DELETE 1"


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
