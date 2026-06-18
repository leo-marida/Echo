import { useEffect, useRef, useState, useCallback } from "react";
import type { MeetingReport, MeetingSSEEvent } from "@/lib/types";

type StreamStatus = "idle" | "connecting" | "connected" | "error";

export interface TranscriptSegment {
  text: string;
  timestamp: number; // ms since stream connected
}

const STALE_THRESHOLD_MS = 30_000;
const STALE_CHECK_INTERVAL_MS = 5_000;

export function useMeetingStream(meetingId: string | null) {
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [partial, setPartial] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [report, setReport] = useState<MeetingReport | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const startedAtRef = useRef<number>(0);
  const lastEventAtRef = useRef<number>(0);

  useEffect(() => {
    if (!meetingId) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    const es = new EventSource(`${apiUrl}/api/v1/meetings/${meetingId}/stream`);
    eventSourceRef.current = es;
    startedAtRef.current = Date.now();
    lastEventAtRef.current = Date.now();
    setStatus("connecting");

    es.onmessage = (raw) => {
      lastEventAtRef.current = Date.now();
      setIsStale(false);

      let event: MeetingSSEEvent;
      try {
        event = JSON.parse(raw.data);
      } catch {
        return;
      }

      switch (event.type) {
        case "connected":
          setStatus("connected");
          break;
        case "caption":
          if (event.is_final) {
            setSegments((prev) => [
              ...prev,
              { text: event.text, timestamp: Date.now() - startedAtRef.current },
            ]);
            setPartial("");
          } else {
            setPartial((prev) => prev + event.text);
          }
          break;
        case "processing":
          setIsProcessing(true);
          break;
        case "done":
          setIsProcessing(false);
          setReport(event.report);
          es.close();
          break;
        case "error":
          setError(event.message);
          break;
      }
    };

    // EventSource retries automatically on transport-level drops; we only
    // surface connection state here — never a raw error to the UI.
    es.onerror = () => {
      setStatus(es.readyState === EventSource.CONNECTING ? "connecting" : "error");
    };

    const staleCheck = setInterval(() => {
      if (isProcessing && Date.now() - lastEventAtRef.current > STALE_THRESHOLD_MS) {
        setIsStale(true);
      }
    }, STALE_CHECK_INTERVAL_MS);

    return () => {
      clearInterval(staleCheck);
      es.close();
      eventSourceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  const reset = useCallback(() => {
    setSegments([]);
    setPartial("");
    setIsProcessing(false);
    setReport(null);
    setIsStale(false);
    setError(null);
  }, []);

  return { status, segments, partial, isProcessing, report, isStale, error, reset };
}
