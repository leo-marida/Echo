"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { listMeetings, createMeeting } from "@/lib/api";
import { MeetingCard } from "@/components/meeting-card";
import type { Meeting } from "@/lib/types";

const RETRY_INTERVAL_MS = 3_000;
const SLOW_WAKE_THRESHOLD_MS = 60_000;

export default function MeetingsHistoryPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "waking" | "ready">("loading");
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    const attempt = () => {
      listMeetings()
        .then((data) => {
          if (cancelled) return;
          setMeetings(data);
          setLoadState("ready");
        })
        .catch(() => {
          if (cancelled) return;
          setLoadState(Date.now() - startedAt > SLOW_WAKE_THRESHOLD_MS ? "waking" : "loading");
          setTimeout(attempt, RETRY_INTERVAL_MS);
        });
    };
    attempt();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStart = () => {
    setIsStarting(true);
    createMeeting()
      .then((m) => router.push(`/meetings/${m.id}`))
      .catch(() => setIsStarting(false));
  };

  if (loadState !== "ready" || !meetings) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {loadState === "waking" ? "Waking up server…" : "Loading…"}
        </p>
      </main>
    );
  }

  if (meetings.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
        <p className="text-sm text-zinc-500">No meetings yet. Start your first one.</p>
        <button
          onClick={handleStart}
          disabled={isStarting}
          className="flex h-11 w-40 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isStarting ? "Starting…" : "Start Meeting"}
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-medium text-foreground">Meetings</h1>
        <Link href="/" className="text-sm text-primary hover:opacity-80">
          New Meeting
        </Link>
      </div>
      <div className="rounded-xl border border-border">
        {meetings.map((meeting) => (
          <MeetingCard key={meeting.id} meeting={meeting} />
        ))}
      </div>
    </main>
  );
}
