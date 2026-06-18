"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Mic, Square, Loader2 } from "lucide-react";
import { getMeeting, getMeetingReport } from "@/lib/api";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useMeetingSocket } from "@/hooks/use-meeting-socket";
import { useMeetingStream } from "@/hooks/use-meeting-stream";
import { ActionItemList } from "@/components/action-item-list";
import { StatusIndicator } from "@/components/status-indicator";
import { MeetingReportView } from "@/components/meeting-report";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Meeting, MeetingReport } from "@/lib/types";

const RETRY_INTERVAL_MS = 3_000;
const SLOW_WAKE_THRESHOLD_MS = 60_000;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000];

function formatTimer(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

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

function MicPermissionHelp() {
  return (
    <div className="flex max-w-xs flex-col gap-3 text-center">
      <p className="text-sm text-foreground">Microphone access is blocked</p>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        <span className="text-foreground">Chrome:</span> click the lock icon in the address bar →
        Site settings → Microphone → Allow, then reload this page.
      </p>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        <span className="text-foreground">Safari:</span> Safari menu → Settings → Websites →
        Microphone → set this site to Allow, then reload this page.
      </p>
    </div>
  );
}

export default function MeetingPage() {
  const params = useParams<{ meetingId: string }>();
  const meetingId = params.meetingId;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "waking" | "not-found" | "ready">(
    "loading"
  );
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "ended">("idle");
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectIn, setReconnectIn] = useState(0);
  const [restReport, setRestReport] = useState<MeetingReport | null>(null);

  const timerStartRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intentionalDisconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const scrollBottomRef = useRef<HTMLDivElement>(null);

  // A meeting that's already complete/failed has nothing live to stream — opening
  // an SSE connection for it would just hang forever (the backend blocks on
  // pub/sub messages that will never arrive for a finished session).
  const isFinished = meeting?.status === "complete" || meeting?.status === "failed";
  const socket = useMeetingSocket(meetingId ?? null);
  const stream = useMeetingStream(isFinished ? null : meetingId ?? null);
  const recorder = useAudioRecorder((chunk) => socket.sendAudio(chunk));

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

  // Timer, running only while actively recording.
  useEffect(() => {
    if (recordingState === "recording") {
      timerStartRef.current = Date.now() - elapsedMs;
      timerIntervalRef.current = setInterval(() => {
        setElapsedMs(Date.now() - (timerStartRef.current ?? Date.now()));
      }, 1000);
    } else if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingState]);

  // Unexpected WebSocket drop mid-recording: reconnect with exponential backoff.
  useEffect(() => {
    if (
      socket.status !== "disconnected" ||
      recordingState !== "recording" ||
      intentionalDisconnectRef.current
    ) {
      return;
    }

    const delay =
      RECONNECT_DELAYS_MS[Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS_MS.length - 1)];
    setReconnecting(true);
    setReconnectIn(delay / 1000);

    const countdown = setInterval(() => {
      setReconnectIn((prev) => Math.max(0, prev - 1));
    }, 1000);

    const timeout = setTimeout(() => {
      reconnectAttemptRef.current += 1;
      socket.connect();
      setReconnecting(false);
    }, delay);

    return () => {
      clearTimeout(timeout);
      clearInterval(countdown);
    };
  }, [socket, socket.status, recordingState]);

  // Auto-scroll the live transcript to the bottom as new segments/partial text arrive.
  useEffect(() => {
    scrollBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [stream.segments, stream.partial]);

  const handleStart = useCallback(async () => {
    try {
      socket.connect();
      await recorder.start();
      intentionalDisconnectRef.current = false;
      reconnectAttemptRef.current = 0;
      setElapsedMs(0);
      setRecordingState("recording");
    } catch (err) {
      if (err instanceof DOMException) {
        setMicPermissionDenied(true);
      }
    }
  }, [socket, recorder]);

  const handleEndMeeting = useCallback(() => {
    intentionalDisconnectRef.current = true;
    recorder.stop();
    socket.sendStop();
    setRecordingState("ended");
  }, [recorder, socket]);

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
      <section className="flex-1 border-b border-border p-8 lg:basis-3/5 lg:border-b-0 lg:border-r">
        <div className="mb-6 flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Live Transcript
          </span>
          {recordingState === "recording" && <StatusIndicator status="recording" />}
        </div>

        <ScrollArea className="h-[70vh]">
          <div className="flex flex-col gap-3 pr-4">
            {stream.segments.length === 0 && !stream.partial && (
              <p className="text-sm text-zinc-600">
                Transcript will appear here once you start speaking.
              </p>
            )}
            {stream.segments.map((seg, i) => (
              <div key={i} className="flex animate-fade-in gap-3">
                <span className="shrink-0 font-mono text-xs text-zinc-600">
                  {formatTimer(seg.timestamp)}
                </span>
                <span className="text-sm text-foreground">{seg.text}</span>
              </div>
            ))}
            {stream.partial && (
              <div className="flex gap-1 text-sm text-muted-foreground">
                <span>{stream.partial}</span>
                <span className="animate-blink-cursor">▍</span>
              </div>
            )}
            <div ref={scrollBottomRef} />
          </div>
        </ScrollArea>
      </section>

      <section className="flex flex-col items-center justify-center gap-8 p-8 lg:basis-2/5">
        {micPermissionDenied ? (
          <MicPermissionHelp />
        ) : reconnecting ? (
          <p className="text-sm text-status-processing">
            Connection lost — attempting to reconnect… ({reconnectIn}s)
          </p>
        ) : (
          <>
            <div className="font-mono text-3xl text-foreground">{formatTimer(elapsedMs)}</div>

            <button
              onClick={recordingState === "idle" ? handleStart : undefined}
              disabled={recordingState === "ended"}
              className={cn(
                "flex h-20 w-20 items-center justify-center rounded-full bg-primary disabled:opacity-50",
                recordingState === "recording" && "animate-pulse-ring"
              )}
            >
              {recordingState === "recording" ? (
                <Square size={28} className="text-primary-foreground" />
              ) : recordingState === "ended" ? (
                <Loader2 size={28} className="animate-spin text-primary-foreground" />
              ) : (
                <Mic size={28} className="text-primary-foreground" />
              )}
            </button>

            <p className="text-sm text-muted-foreground">
              {recordingState === "idle" && "Tap to start"}
              {recordingState === "recording" && "Recording…"}
              {recordingState === "ended" &&
                (stream.isStale ? "Still analyzing…" : "Analyzing…")}
            </p>

            <div className="w-full max-w-xs">
              {/* Placeholder: the backend only runs extraction once, after the
                  meeting ends — there is no incremental mid-meeting extraction
                  to show here yet. See chat for details. */}
              <ActionItemList
                items={[]}
                animateNew
                emptyText="Action items will appear here as they're detected."
              />
            </div>

            {recordingState === "recording" && (
              <button
                onClick={handleEndMeeting}
                className="text-sm text-zinc-600 transition-colors hover:text-zinc-400"
              >
                End Meeting
              </button>
            )}
          </>
        )}
      </section>
    </main>
  );
}
