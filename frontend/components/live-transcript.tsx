"use client";

import { useEffect, useRef } from "react";
import { StatusIndicator } from "@/components/status-indicator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatTimer } from "@/lib/utils";
import type { TranscriptSegment } from "@/hooks/use-meeting-stream";

interface LiveTranscriptProps {
  segments: TranscriptSegment[];
  partial: string;
  isRecording: boolean;
}

export function LiveTranscript({ segments, partial, isRecording }: LiveTranscriptProps) {
  const scrollBottomRef = useRef<HTMLDivElement>(null);

  // Smooth auto-scroll to bottom as new segments/partial text arrive.
  useEffect(() => {
    scrollBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments, partial]);

  return (
    <section className="flex-1 border-b border-border p-8 lg:basis-3/5 lg:border-b-0 lg:border-r">
      <div className="mb-6 flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Live Transcript
        </span>
        {isRecording && <StatusIndicator status="recording" />}
      </div>

      <ScrollArea className="h-[70vh]">
        <div className="flex flex-col gap-3 pr-4">
          {segments.length === 0 && !partial && (
            <p className="text-sm text-zinc-600">
              Transcript will appear here once you start speaking.
            </p>
          )}
          {segments.map((seg, i) => (
            <div key={i} className="flex animate-fade-in gap-3">
              <span className="shrink-0 font-mono text-xs text-zinc-600">
                {formatTimer(seg.timestamp)}
              </span>
              <span className="text-sm text-foreground">{seg.text}</span>
            </div>
          ))}
          {partial && (
            <div className="flex gap-1 text-sm text-muted-foreground">
              <span>{partial}</span>
              <span className="animate-blink-cursor">▍</span>
            </div>
          )}
          <div ref={scrollBottomRef} />
        </div>
      </ScrollArea>
    </section>
  );
}
