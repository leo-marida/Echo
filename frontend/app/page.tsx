"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { createMeeting } from "@/lib/api";
import { AccountMenu } from "@/components/account-menu";
import { ThemeToggle } from "@/components/theme-toggle";

const RETRY_INTERVAL_MS = 3_000;
const SLOW_WAKE_THRESHOLD_MS = 60_000;

function SoundWave() {
  return (
    <div className="flex items-end gap-[3px] h-4">
      {[0, 150, 300].map((delay) => (
        <div
          key={delay}
          className="w-[3px] bg-foreground animate-wave-bar"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [isStarting, setIsStarting] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const handleStart = () => {
    if (!session) {
      signIn("google");
      return;
    }

    setIsStarting(true);
    setIsSlow(false);
    setSessionExpired(false);
    const startedAt = Date.now();

    const attempt = () => {
      createMeeting(null, session.backendToken)
        .then((meeting) => {
          router.push(`/meetings/${meeting.id}`);
        })
        .catch((err) => {
          // A 401 means the backend token (1hr expiry) is stale -- retrying with
          // the same token forever would just loop on "Starting..." with no exit.
          if (err instanceof Error && err.message.includes("401")) {
            setIsStarting(false);
            setSessionExpired(true);
            return;
          }
          if (Date.now() - startedAt > SLOW_WAKE_THRESHOLD_MS) {
            setIsSlow(true);
          }
          setTimeout(attempt, RETRY_INTERVAL_MS);
        });
    };

    attempt();
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="absolute top-6 right-6 flex items-center gap-3">
        <ThemeToggle />
        <AccountMenu />
      </div>

      <div className="flex flex-col items-center gap-8">
        <div className="flex items-center gap-2.5">
          <SoundWave />
          <span className="font-mono text-2xl text-foreground">echo</span>
        </div>

        <p className="text-base text-muted-foreground">
          Every word. Captured. Structured.
        </p>

        {sessionExpired ? (
          <>
            <p className="text-sm text-zinc-500">Your session expired. Please sign in again.</p>
            <button
              onClick={() => signIn("google")}
              className="flex h-11 w-48 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Sign in with Google
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleStart}
              disabled={isStarting || sessionStatus === "loading"}
              className="flex h-11 w-48 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {isStarting
                ? isSlow
                  ? "Waking up server…"
                  : "Starting…"
                : session
                  ? "Start Meeting"
                  : "Sign in to start"}
            </button>

            <p className="text-[13px] text-zinc-600">Sign in with Google · Free to use</p>
          </>
        )}
      </div>
    </main>
  );
}
