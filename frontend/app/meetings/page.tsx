"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { listMeetings, createMeeting, discardMeeting } from "@/lib/api";
import { MeetingCard } from "@/components/meeting-card";
import { AccountMenu } from "@/components/account-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Meeting } from "@/lib/types";

const RETRY_INTERVAL_MS = 3_000;
const SLOW_WAKE_THRESHOLD_MS = 60_000;

export default function MeetingsHistoryPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "waking" | "ready" | "session-expired">(
    "loading"
  );
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !session.backendToken) return;

    let cancelled = false;
    const startedAt = Date.now();

    const attempt = () => {
      listMeetings(session.backendToken!)
        .then((data) => {
          if (cancelled) return;
          setMeetings(data);
          setLoadState("ready");
        })
        .catch((err) => {
          if (cancelled) return;
          // A 401 means the backend token (1hr expiry) is stale or invalid -- that's
          // not "the server is still waking up," and retrying with the same token
          // forever would just loop on "Loading..." with no way out. Surface it.
          if (err instanceof Error && err.message.includes("401")) {
            setLoadState("session-expired");
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
  }, [sessionStatus, session?.backendToken]);

  const handleStart = () => {
    setIsStarting(true);
    createMeeting(null, session?.backendToken)
      .then((m) => router.push(`/meetings/${m.id}`))
      .catch(() => setIsStarting(false));
  };

  const handleDiscard = (meetingId: string) => {
    if (!session?.backendToken) return;
    setMeetings((prev) => prev?.filter((m) => m.id !== meetingId) ?? prev);
    discardMeeting(meetingId, session.backendToken).catch(() => {
      // Re-fetch on failure rather than leaving the list in a possibly-wrong state.
      listMeetings(session.backendToken!).then(setMeetings);
    });
  };

  if (sessionStatus === "loading") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (sessionStatus === "unauthenticated") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="absolute top-6 right-6">
          <ThemeToggle />
        </div>
        <p className="text-sm text-zinc-500">Sign in to see your meeting history.</p>
        <button
          onClick={() => signIn("google")}
          className="flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Sign in with Google
        </button>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          Back to home
        </Link>
      </main>
    );
  }

  if (loadState === "session-expired") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
        <p className="text-sm text-zinc-500">Your session expired. Please sign in again.</p>
        <button
          onClick={() => signIn("google")}
          className="flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Sign in with Google
        </button>
      </main>
    );
  }

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
        <div className="absolute top-6 right-6 flex items-center gap-3">
          <ThemeToggle />
          <AccountMenu />
        </div>
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
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-primary hover:opacity-80">
            New Meeting
          </Link>
          <ThemeToggle />
          <AccountMenu />
        </div>
      </div>
      <div className="rounded-xl border border-border">
        {meetings.map((meeting) => (
          <MeetingCard key={meeting.id} meeting={meeting} onDiscard={handleDiscard} />
        ))}
      </div>
    </main>
  );
}
