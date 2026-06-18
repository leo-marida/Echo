import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Meeting } from "@/lib/types";
import { StatusIndicator } from "@/components/status-indicator";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

interface MeetingCardProps {
  meeting: Meeting;
}

export function MeetingCard({ meeting }: MeetingCardProps) {
  const date = new Date(meeting.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Link
      href={`/meetings/${meeting.id}`}
      className="flex flex-col gap-2 border-b border-border px-6 py-4 transition-colors last:border-b-0 hover:bg-secondary sm:flex-row sm:items-center sm:justify-between sm:gap-4"
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
        <span className="shrink-0 text-sm text-primary">View Report</span>
      </div>
    </Link>
  );
}
