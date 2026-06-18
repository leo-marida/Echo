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
