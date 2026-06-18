import json
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import meeting_service

router = APIRouter()


class CreateMeetingRequest(BaseModel):
    title: str | None = None


class UpdateMeetingTitleRequest(BaseModel):
    title: str


class MeetingResponse(BaseModel):
    id: UUID
    title: str | None
    status: str
    started_at: str | None = None
    ended_at: str | None = None
    duration_seconds: int | None = None
    created_at: str
    updated_at: str


class MeetingReportResponse(BaseModel):
    summary: str
    action_items: list[dict]
    key_decisions: list[str]
    attendees: list[str]
    topics: list[str]
    sentiment: str
    transcript: str


def _to_response(record) -> MeetingResponse:
    return MeetingResponse(
        id=record["id"],
        title=record["title"],
        status=record["status"],
        started_at=record["started_at"].isoformat() if record["started_at"] else None,
        ended_at=record["ended_at"].isoformat() if record["ended_at"] else None,
        duration_seconds=record["duration_seconds"],
        created_at=record["created_at"].isoformat(),
        updated_at=record["updated_at"].isoformat(),
    )


@router.post("/meetings", response_model=MeetingResponse)
async def create_meeting(payload: CreateMeetingRequest):
    record = await meeting_service.create_meeting(payload.title)
    return _to_response(record)


@router.get("/meetings", response_model=list[MeetingResponse])
async def list_meetings():
    records = await meeting_service.list_meetings()
    return [_to_response(record) for record in records]


@router.get("/meetings/{meeting_id}", response_model=MeetingResponse)
async def get_meeting(meeting_id: UUID):
    record = await meeting_service.get_meeting(str(meeting_id))
    if record is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return _to_response(record)


@router.patch("/meetings/{meeting_id}", response_model=MeetingResponse)
async def update_meeting_title(meeting_id: UUID, payload: UpdateMeetingTitleRequest):
    record = await meeting_service.update_meeting_title(str(meeting_id), payload.title)
    if record is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return _to_response(record)


@router.get("/meetings/{meeting_id}/report", response_model=MeetingReportResponse)
async def get_meeting_report(meeting_id: UUID):
    record = await meeting_service.get_meeting_report(str(meeting_id))
    if record is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return MeetingReportResponse(
        summary=record["summary"],
        action_items=json.loads(record["action_items"]),
        key_decisions=json.loads(record["key_decisions"]),
        attendees=json.loads(record["attendees"]),
        topics=json.loads(record["topics"]),
        sentiment=record["sentiment"],
        transcript=record["transcript"] or "",
    )
