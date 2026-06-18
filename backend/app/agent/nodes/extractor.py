"""
gpt-4.1-mini: fast incremental extraction of action items and decisions.
Runs once per meeting on the full transcript. Cost: fractions of a cent.
"""
from openai import AsyncOpenAI
from app.config import settings
from app.agent.state import MeetingState, ActionItem
import json
import uuid

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
