import type { Meeting, MeetingReport } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function authHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function createMeeting(title?: string | null, token?: string | null): Promise<Meeting> {
  return fetch(`${API_URL}/api/v1/meetings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ title: title ?? null }),
  }).then((res) => handle<Meeting>(res));
}

export function getMeeting(meetingId: string): Promise<Meeting> {
  return fetch(`${API_URL}/api/v1/meetings/${meetingId}`).then((res) =>
    handle<Meeting>(res)
  );
}

// Requires a signed-in user's token — meeting history is always scoped to one account.
export function listMeetings(token: string): Promise<Meeting[]> {
  return fetch(`${API_URL}/api/v1/meetings`, {
    headers: authHeaders(token),
  }).then((res) => handle<Meeting[]>(res));
}

export function getMeetingReport(meetingId: string): Promise<MeetingReport> {
  return fetch(`${API_URL}/api/v1/meetings/${meetingId}/report`).then((res) =>
    handle<MeetingReport>(res)
  );
}

export function updateMeetingTitle(meetingId: string, title: string): Promise<Meeting> {
  return fetch(`${API_URL}/api/v1/meetings/${meetingId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  }).then((res) => handle<Meeting>(res));
}

export function discardMeeting(meetingId: string, token: string): Promise<void> {
  return fetch(`${API_URL}/api/v1/meetings/${meetingId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  }).then((res) => {
    if (!res.ok) {
      throw new Error(`Request failed: ${res.status} ${res.statusText}`);
    }
  });
}
