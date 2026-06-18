from app.agent.nodes import structurer


def _base_state(**overrides):
    state = {
        "action_items": [],
        "key_decisions": [],
        "attendees": [],
        "topics": [],
        "summary": "A summary.",
        "sentiment": "positive",
    }
    state.update(overrides)
    return state


async def test_normalizes_invalid_priority_to_medium():
    state = _base_state(
        action_items=[{"id": "1", "text": "do thing", "owner": None, "priority": "urgent!!"}]
    )
    result = await structurer.run(state)
    assert result["action_items"][0]["priority"] == "medium"
    assert result["error"] is None


async def test_keeps_valid_priority():
    state = _base_state(
        action_items=[{"id": "1", "text": "do thing", "owner": None, "priority": "high"}]
    )
    result = await structurer.run(state)
    assert result["action_items"][0]["priority"] == "high"


async def test_normalizes_invalid_sentiment_to_neutral():
    state = _base_state(sentiment="ecstatic")
    result = await structurer.run(state)
    assert result["sentiment"] == "neutral"


async def test_dedupes_case_insensitive():
    state = _base_state(topics=["Sprint Review", "sprint review", "Release"])
    result = await structurer.run(state)
    assert result["topics"] == ["Sprint Review", "Release"]


async def test_empty_summary_gets_fallback():
    state = _base_state(summary="   ")
    result = await structurer.run(state)
    assert result["summary"] == "No summary available."
