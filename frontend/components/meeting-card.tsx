"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Meeting } from "@/lib/types";
import { StatusIndicator } from "@/components/status-indicator";
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

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

interface MeetingCardProps {
  meeting: Meeting;
  onDiscard?: (meetingId: string) => void;
}

export function MeetingCard({ meeting, onDiscard }: MeetingCardProps) {
  const router = useRouter();
  const date = new Date(meeting.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/meetings/${meeting.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(`/meetings/${meeting.id}`);
      }}
      className="flex cursor-pointer flex-col gap-2 border-b border-border px-6 py-4 transition-colors last:border-b-0 hover:bg-secondary sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        <StatusIndicator status={meeting.status} />
        <span
          className={cn(
            "truncate text-sm",
            meeting.title ? "text-foreground" : "text-zinc-500"
          )}
        >
          {meeting.title ?? "Untitled Meeting"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 sm:contents">
        <span className="text-sm text-muted-foreground">
          {date} · {formatDuration(meeting.duration_seconds)}
        </span>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm text-primary">View Report</span>
          {onDiscard && (
            <Dialog>
              <DialogTrigger
                onClick={(e) => e.stopPropagation()}
                aria-label="Discard meeting"
                className="text-zinc-600 transition-colors hover:text-destructive"
              >
                <Trash2 size={14} />
              </DialogTrigger>
              <DialogContent onClick={(e) => e.stopPropagation()}>
                <DialogHeader>
                  <DialogTitle>Discard this meeting?</DialogTitle>
                  <DialogDescription>
                    This permanently deletes the transcript and report for &quot;
                    {meeting.title ?? "Untitled Meeting"}&quot;. This can&apos;t be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-foreground transition-colors hover:bg-secondary">
                    Cancel
                  </DialogClose>
                  <DialogClose
                    onClick={() => onDiscard(meeting.id)}
                    className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                  >
                    Discard
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
    </div>
  );
}
