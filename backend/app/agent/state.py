from typing import TypedDict, List, Optional
from langgraph.graph.message import add_messages
from typing import Annotated


class ActionItem(TypedDict):
    id: str
    text: str
    owner: Optional[str]
    priority: str        # high | medium | low


class MeetingState(TypedDict):
    meeting_id: str
    raw_transcript: str
    segments: List[str]  # Transcript chunks as they arrived

    # Extracted content
    action_items: List[ActionItem]
    key_decisions: List[str]
    attendees: List[str]
    topics: List[str]
    summary: Optional[str]
    sentiment: Optional[str]

    # Pipeline control
    current_node: str
    error: Optional[str]
    stream_tokens: Annotated[List[str], add_messages]
