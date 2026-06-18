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
