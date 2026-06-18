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
