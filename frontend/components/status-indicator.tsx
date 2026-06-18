import { cn } from "@/lib/utils";
import type { Meeting } from "@/lib/types";

type Status = Meeting["status"];

const STATUS_COLOR: Record<Status, string> = {
  idle: "bg-status-idle",
  recording: "bg-status-recording",
  processing: "bg-status-processing",
  complete: "bg-status-complete",
  failed: "bg-status-recording",
};

interface StatusIndicatorProps {
  status: Status;
  className?: string;
}

export function StatusIndicator({ status, className }: StatusIndicatorProps) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        STATUS_COLOR[status],
        status === "recording" && "animate-dot-pulse",
        className
      )}
    />
  );
}
