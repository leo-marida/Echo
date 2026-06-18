export interface ActionItem {
  id: string;
  text: string;
  owner: string | null;
  priority: "high" | "medium" | "low";
}

export interface MeetingReport {
  summary: string;
  action_items: ActionItem[];
  key_decisions: string[];
  attendees: string[];
  topics: string[];
  sentiment: "positive" | "neutral" | "negative";
  transcript: string;
}

export interface Meeting {
  id: string;
  title: string | null;
  status: "idle" | "recording" | "processing" | "complete" | "failed";
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export type MeetingSSEEvent =
  | { type: "connected"; meeting_id: string }
  | { type: "caption"; text: string; is_final: boolean }
  | { type: "processing"; message: string }
  | { type: "done"; report: MeetingReport }
  | { type: "error"; message: string };
