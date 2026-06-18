"use client";

import { useState } from "react";
import { Check, ChevronRight, Copy, ChevronDown } from "lucide-react";
import { ActionItemList } from "@/components/action-item-list";
import { StatusIndicator } from "@/components/status-indicator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { updateMeetingTitle } from "@/lib/api";
import type { Meeting, MeetingReport as MeetingReportData } from "@/lib/types";

const SENTIMENT_STATUS = {
  positive: "complete",
  neutral: "idle",
  negative: "recording",
} as const;

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="text-zinc-600 transition-colors hover:text-zinc-400"
      aria-label="Copy"
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
    </button>
  );
}

function ReportCard({
  title,
  copyContent,
  children,
  delayMs,
}: {
  title: string;
  copyContent: string;
  children: React.ReactNode;
  delayMs: number;
}) {
  return (
    <div
      className="animate-card-fade-in rounded-xl border border-border bg-card p-6"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {title}
        </span>
        <CopyButton content={copyContent} />
      </div>
      {children}
    </div>
  );
}

function TagList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-600">None</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-md bg-secondary px-2.5 py-1 text-[13px] text-muted-foreground"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

interface MeetingReportProps {
  meeting: Meeting;
  report: MeetingReportData;
  onTitleChange?: (title: string) => void;
}

export function MeetingReportView({ meeting, report, onTitleChange }: MeetingReportProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(meeting.title ?? "Untitled Meeting");
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const saveTitle = () => {
    setEditingTitle(false);
    const trimmed = titleValue.trim();
    if (!trimmed || trimmed === meeting.title) return;
    updateMeetingTitle(meeting.id, trimmed)
      .then((updated) => onTitleChange?.(updated.title ?? trimmed))
      .catch(() => {
        // Rename is a non-critical nicety — silently keep the local value rather
        // than blocking the report view on a failed PATCH.
      });
  };

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {editingTitle ? (
          <input
            autoFocus
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveTitle();
              if (e.key === "Escape") {
                setTitleValue(meeting.title ?? "Untitled Meeting");
                setEditingTitle(false);
              }
            }}
            className="border-b border-border bg-transparent text-xl font-medium text-foreground outline-none"
          />
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            className="text-xl font-medium text-foreground hover:opacity-80"
          >
            {meeting.title ?? "Untitled Meeting"}
          </button>
        )}

        <div className="flex items-center gap-3">
          <span className="rounded-md border border-border px-2.5 py-1 text-[13px] text-muted-foreground">
            {formatDuration(meeting.duration_seconds)}
          </span>
          <span className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[13px] text-muted-foreground">
            <StatusIndicator status={SENTIMENT_STATUS[report.sentiment]} />
            {report.sentiment}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ReportCard title="Summary" copyContent={report.summary} delayMs={0}>
          <p className="text-[15px] leading-[1.7] text-zinc-300">{report.summary}</p>
        </ReportCard>

        <ReportCard
          title="Key Decisions"
          copyContent={report.key_decisions.map((d, i) => `${i + 1}. ${d}`).join("\n")}
          delayMs={100}
        >
          {report.key_decisions.length === 0 ? (
            <p className="text-sm text-zinc-600">No decisions recorded.</p>
          ) : (
            <ol className="flex flex-col gap-4">
              {report.key_decisions.map((decision, i) => (
                <li key={i} className="flex items-start gap-2">
                  <ChevronRight size={16} className="mt-0.5 shrink-0 text-primary" />
                  <span className="text-sm text-foreground">{decision}</span>
                </li>
              ))}
            </ol>
          )}
        </ReportCard>

        <ReportCard
          title="Action Items"
          copyContent={report.action_items
            .map((a) => `${a.text}${a.owner ? ` (${a.owner})` : ""} [${a.priority}]`)
            .join("\n")}
          delayMs={200}
        >
          <ActionItemList items={report.action_items} emptyText="No action items." />
        </ReportCard>

        <ReportCard
          title="Topics & Attendees"
          copyContent={`Topics: ${report.topics.join(", ")}\nAttendees: ${report.attendees.join(", ")}`}
          delayMs={300}
        >
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-xs text-zinc-600">Topics</p>
              <TagList items={report.topics} />
            </div>
            <div>
              <p className="mb-2 text-xs text-zinc-600">Attendees</p>
              <TagList items={report.attendees} />
            </div>
          </div>
        </ReportCard>
      </div>

      <Collapsible open={transcriptOpen} onOpenChange={setTranscriptOpen}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          Full Transcript
          <ChevronDown
            size={16}
            className={cn("transition-transform", transcriptOpen && "rotate-180")}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-border bg-card p-6 font-mono text-[13px] leading-[1.8] text-muted-foreground">
            {report.transcript}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </main>
  );
}
