"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, Pause, Play, Loader2 } from "lucide-react";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useMeetingSocket } from "@/hooks/use-meeting-socket";
import { ActionItemList } from "@/components/action-item-list";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn, formatTimer } from "@/lib/utils";

const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000];

// Matches the backend's MAX_RECORDING_SECONDS safety cap (audio_handler.py) — OpenAI's
// Realtime API hard-caps sessions at 60 minutes, the backend ends 1 minute early for a
// clean flush. Warn the user 5 minutes before that so the auto-end isn't a surprise.
const MAX_RECORDING_MS = 59 * 60 * 1000;
const WARNING_THRESHOLD_MS = 54 * 60 * 1000;

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

function StartErrorHelp({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex max-w-xs flex-col items-center gap-3 text-center">
      <p className="text-sm text-foreground">{message}</p>
      <button
        onClick={onRetry}
        className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
      >
        Try again
      </button>
    </div>
  );
}

// getUserMedia/AudioContext/ScriptProcessorNode can all throw DOMException for reasons
// that have nothing to do with permission (e.g. invalid buffer size, no device found,
// hardware errors) — treating every DOMException as "permission denied" produces a
// misleading message when the real failure is something else entirely.
const PERMISSION_ERROR_NAMES = new Set(["NotAllowedError", "PermissionDeniedError", "SecurityError"]);

export type RecordingState = "idle" | "recording" | "paused" | "ended";

interface MeetingRecorderProps {
  meetingId: string;
  isStale: boolean;
  onRecordingStateChange?: (state: RecordingState) => void;
}

export function MeetingRecorder({
  meetingId,
  isStale,
  onRecordingStateChange,
}: MeetingRecorderProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectIn, setReconnectIn] = useState(0);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);

  const timerStartRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intentionalDisconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(0);

  const socket = useMeetingSocket(meetingId);
  const recorder = useAudioRecorder((chunk) => socket.sendAudio(chunk));

  const setState = useCallback(
    (state: RecordingState) => {
      setRecordingState(state);
      onRecordingStateChange?.(state);
    },
    [onRecordingStateChange]
  );

  // Timer, running only while actively recording — freezes while paused and
  // resumes from the same elapsed value rather than resetting.
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

  const handleStart = useCallback(async () => {
    setStartError(null);
    try {
      socket.connect();
      await recorder.start();
      intentionalDisconnectRef.current = false;
      reconnectAttemptRef.current = 0;
      setElapsedMs(0);
      setState("recording");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : undefined;
      if (name && PERMISSION_ERROR_NAMES.has(name)) {
        setMicPermissionDenied(true);
      } else {
        console.error("Failed to start recording:", err);
        setStartError("Couldn't start recording. Please check your microphone and try again.");
      }
    }
  }, [socket, recorder, setState]);

  // Pause/resume only stop and restart audio capture — the WebSocket stays
  // connected throughout, so resuming doesn't need to reconnect anything.
  const handlePause = useCallback(() => {
    recorder.stop();
    setState("paused");
  }, [recorder, setState]);

  const handleResume = useCallback(async () => {
    setStartError(null);
    try {
      await recorder.start();
      setState("recording");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : undefined;
      if (name && PERMISSION_ERROR_NAMES.has(name)) {
        setMicPermissionDenied(true);
      } else {
        console.error("Failed to resume recording:", err);
        setStartError("Couldn't resume recording. Please check your microphone and try again.");
      }
    }
  }, [recorder, setState]);

  const handleEndMeeting = useCallback(() => {
    intentionalDisconnectRef.current = true;
    recorder.stop();
    socket.sendStop();
    setState("ended");
    setConfirmEndOpen(false);
  }, [recorder, socket, setState]);

  if (micPermissionDenied) {
    return <MicPermissionHelp />;
  }

  if (startError) {
    return <StartErrorHelp message={startError} onRetry={() => setStartError(null)} />;
  }

  if (reconnecting) {
    return (
      <p className="text-sm text-status-processing">
        Connection lost — attempting to reconnect… ({reconnectIn}s)
      </p>
    );
  }

  const handleMainButtonClick =
    recordingState === "idle"
      ? handleStart
      : recordingState === "recording"
        ? handlePause
        : recordingState === "paused"
          ? handleResume
          : undefined;

  return (
    <>
      <div className="flex flex-col items-center gap-1">
        <div className="font-mono text-3xl text-foreground">{formatTimer(elapsedMs)}</div>
        {recordingState === "idle" && (
          <p className="text-xs text-zinc-600">60 min max per meeting</p>
        )}
        {(recordingState === "recording" || recordingState === "paused") &&
          elapsedMs >= WARNING_THRESHOLD_MS && (
            <p className="text-xs text-status-processing">
              {Math.max(0, Math.ceil((MAX_RECORDING_MS - elapsedMs) / 60_000))} min left — this
              meeting will end automatically at 59 min
            </p>
          )}
      </div>

      <button
        onClick={handleMainButtonClick}
        disabled={recordingState === "ended"}
        className={cn(
          "flex h-20 w-20 items-center justify-center rounded-full bg-primary disabled:opacity-50",
          recordingState === "recording" && "animate-pulse-ring"
        )}
      >
        {recordingState === "recording" ? (
          <Pause size={28} className="text-primary-foreground" />
        ) : recordingState === "paused" ? (
          <Play size={28} className="text-primary-foreground" />
        ) : recordingState === "ended" ? (
          <Loader2 size={28} className="animate-spin text-primary-foreground" />
        ) : (
          <Mic size={28} className="text-primary-foreground" />
        )}
      </button>

      <p className="text-sm text-muted-foreground">
        {recordingState === "idle" && "Tap to start"}
        {recordingState === "recording" && "Recording…"}
        {recordingState === "paused" && "Paused"}
        {recordingState === "ended" && (isStale ? "Still analyzing…" : "Analyzing…")}
      </p>

      <div className="w-full max-w-xs">
        {/* Placeholder: the backend only runs extraction once, after the meeting
            ends — there is no incremental mid-meeting extraction to show here yet. */}
        <ActionItemList
          items={[]}
          animateNew
          emptyText="Action items will appear here as they're detected."
        />
      </div>

      {(recordingState === "recording" || recordingState === "paused") && (
        <Dialog open={confirmEndOpen} onOpenChange={setConfirmEndOpen}>
          <DialogTrigger className="rounded-lg border border-destructive/40 px-4 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10">
            End Meeting
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>End this meeting?</DialogTitle>
              <DialogDescription>
                This stops recording and starts analyzing the transcript. You won&apos;t be able
                to resume once it&apos;s ended.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-foreground transition-colors hover:bg-secondary">
                Cancel
              </DialogClose>
              <button
                onClick={handleEndMeeting}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                End Meeting
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
