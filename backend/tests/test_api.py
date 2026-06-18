from app.services.meeting_service import _sanitize_transcript_text
from app.api.routes.meetings import CreateMeetingRequest, MeetingReportResponse


def test_sanitize_strips_null_bytes():
    assert _sanitize_transcript_text("hello\x00world") == "helloworld"


def test_sanitize_strips_control_chars_but_keeps_whitespace():
    text = "line one\nline two\ttabbed"
    assert _sanitize_transcript_text(text) == text


def test_sanitize_leaves_normal_text_untouched():
    text = "Sarah will finish the API migration by Friday."
    assert _sanitize_transcript_text(text) == text


def test_create_meeting_request_title_optional():
    payload = CreateMeetingRequest()
    assert payload.title is None


def test_create_meeting_request_accepts_title():
    payload = CreateMeetingRequest(title="Standup")
    assert payload.title == "Standup"


def test_meeting_report_response_round_trip():
    report = MeetingReportResponse(
        summary="A summary",
        action_items=[{"id": "1", "text": "do thing", "owner": None, "priority": "high"}],
        key_decisions=["Ship it"],
        attendees=["Alice"],
        topics=["Launch"],
        sentiment="positive",
        transcript="Alice: let's ship it.",
    )
    assert report.action_items[0]["priority"] == "high"
