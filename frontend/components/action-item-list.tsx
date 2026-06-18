import { cn } from "@/lib/utils";
import type { ActionItem } from "@/lib/types";

// Priority dot color isn't specified explicitly in the design brief — inferred
// from the urgency semantics already established by the status dot colors.
const PRIORITY_COLOR: Record<ActionItem["priority"], string> = {
  high: "bg-status-recording",
  medium: "bg-status-processing",
  low: "bg-status-idle",
};

interface ActionItemListProps {
  items: ActionItem[];
  animateNew?: boolean;
  emptyText?: string;
  className?: string;
}

export function ActionItemList({
  items,
  animateNew = false,
  emptyText = "No action items yet.",
  className,
}: ActionItemListProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <ul className={cn("flex flex-col gap-4", className)}>
      {items.map((item) => (
        <li
          key={item.id}
          className={cn("flex items-start gap-3", animateNew && "animate-slide-in-right")}
        >
          <span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-zinc-600" />
          <span className="flex-1 text-sm text-foreground">{item.text}</span>
          <span
            className={cn(
              "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
              PRIORITY_COLOR[item.priority]
            )}
          />
          {item.owner && (
            <span className="shrink-0 rounded-md bg-owner-chip-bg px-2 py-0.5 text-[11px] text-owner-chip-foreground">
              {item.owner}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
