"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createMeeting } from "@/lib/api";

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
  const [isStarting, setIsStarting] = useState(false);
  const [isSlow, setIsSlow] = useState(false);

  const handleStart = () => {
    setIsStarting(true);
    setIsSlow(false);
    const startedAt = Date.now();

    const attempt = () => {
      createMeeting()
        .then((meeting) => {
          router.push(`/meetings/${meeting.id}`);
        })
        .catch(() => {
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
      <div className="flex flex-col items-center gap-8">
        <div className="flex items-center gap-2.5">
          <SoundWave />
          <span className="font-mono text-2xl text-foreground">echo</span>
        </div>

        <p className="text-base text-muted-foreground">
          Every word. Captured. Structured.
        </p>

        <button
          onClick={handleStart}
          disabled={isStarting}
          className="flex h-11 w-40 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isStarting ? (isSlow ? "Waking up server…" : "Starting…") : "Start Meeting"}
        </button>

        <p className="text-[13px] text-zinc-600">No account needed · Free to try</p>
      </div>
    </main>
  );
}
