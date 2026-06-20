"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { getMeeting, getMeetingReport } from "@/lib/api";
import { useMeetingStream } from "@/hooks/use-meeting-stream";
import { LiveTranscript } from "@/components/live-transcript";
import { MeetingRecorder, type RecordingState } from "@/components/meeting-recorder";
import { MeetingReportView } from "@/components/meeting-report";
import type { Meeting, MeetingReport } from "@/lib/types";

const RETRY_INTERVAL_MS = 3_000;
const SLOW_WAKE_THRESHOLD_MS = 60_000;

function CenteredMessage({
  children,
  spinner = false,
}: {
  children: React.ReactNode;
  spinner?: boolean;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      {spinner && <Loader2 size={20} className="animate-spin text-muted-foreground" />}
      <p className="text-sm text-muted-foreground">{children}</p>
    </main>
  );
}

export default function MeetingPage() {
  const params = useParams<{ meetingId: string }>();
  const meetingId = params.meetingId;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "waking" | "not-found" | "ready">(
    "loading"
  );
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [restReport, setRestReport] = useState<MeetingReport | null>(null);

  // A meeting that's already complete/failed has nothing live to stream — opening
  // an SSE connection for it would just hang forever (the backend blocks on
  // pub/sub messages that will never arrive for a finished session).
  const isFinished = meeting?.status === "complete" || meeting?.status === "failed";
  const stream = useMeetingStream(isFinished ? null : meetingId ?? null);

  const report = stream.report ?? restReport;

  // Load the meeting, retrying through a Render cold-start without ever
  // surfacing a raw error.
  useEffect(() => {
    if (!meetingId) return;
    let cancelled = false;
    const startedAt = Date.now();

    const attempt = () => {
      getMeeting(meetingId)
        .then((m) => {
          if (cancelled) return;
          setMeeting(m);
          setLoadState("ready");
        })
        .catch((err) => {
          if (cancelled) return;
          if (err instanceof Error && err.message.includes("404")) {
            setLoadState("not-found");
            return;
          }
          setLoadState(Date.now() - startedAt > SLOW_WAKE_THRESHOLD_MS ? "waking" : "loading");
          setTimeout(attempt, RETRY_INTERVAL_MS);
        });
    };
    attempt();
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  // Already-complete meeting (e.g. opened from history): fetch the stored
  // report via REST instead of streaming.
  useEffect(() => {
    if (meeting?.status === "complete") {
      getMeetingReport(meetingId).then(setRestReport).catch(() => {});
    }
  }, [meeting?.status, meetingId]);

  if (!meetingId) return null;

  if (loadState === "not-found") {
    return <CenteredMessage>Meeting not found.</CenteredMessage>;
  }

  if (loadState !== "ready" || !meeting) {
    return (
      <CenteredMessage spinner>
        {loadState === "waking" ? "Waking up server…" : "Loading…"}
      </CenteredMessage>
    );
  }

  if (meeting.status === "failed") {
    return <CenteredMessage>Analysis failed for this meeting.</CenteredMessage>;
  }

  if (report) {
    if (!report.transcript.trim()) {
      return (
        <CenteredMessage>
          <span className="flex flex-col items-center gap-4">
            No speech detected. Please check your microphone.
            <button
              onClick={() => {
                stream.reset();
                setRecordingState("idle");
              }}
              className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
            >
              Try again
            </button>
          </span>
        </CenteredMessage>
      );
    }

    return (
      <MeetingReportView
        meeting={meeting}
        report={report}
        onTitleChange={(title) => setMeeting((m) => (m ? { ...m, title } : m))}
      />
    );
  }

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      <div className="absolute top-6 right-6 z-10 flex items-center gap-4">
        <ThemeToggle />
        {/* Opens in a new tab deliberately — navigating here in-place would unmount
            this page and tear down the active WebSocket/audio capture mid-recording. */}
        <Link
          href="/meetings"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Dashboard ↗
        </Link>
      </div>

      <LiveTranscript
        segments={stream.segments}
        partial={stream.partial}
        isRecording={recordingState === "recording"}
      />

      <section className="flex flex-col items-center justify-center gap-8 p-8 lg:basis-2/5">
        <MeetingRecorder
          meetingId={meetingId}
          isStale={stream.isStale}
          onRecordingStateChange={setRecordingState}
        />
      </section>
    </main>
  );
}
