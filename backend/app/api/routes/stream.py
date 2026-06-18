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
