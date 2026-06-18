import { useRef, useCallback, useState } from "react";

type SocketStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export function useMeetingSocket(meetingId: string | null) {
  const [status, setStatus] = useState<SocketStatus>("idle");
  const socketRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!meetingId) return;
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    const ws = new WebSocket(`${wsUrl}/ws/meetings/${meetingId}/audio`);
    socketRef.current = ws;

    ws.onopen = () => setStatus("connected");
    ws.onclose = () => setStatus("disconnected");
    ws.onerror = () => setStatus("error");

    return ws;
  }, [meetingId]);

  const sendAudio = useCallback((pcm16: ArrayBuffer) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(pcm16);
    }
  }, []);

  const sendStop = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "stop" }));
    }
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.close();
  }, []);

  return { status, connect, sendAudio, sendStop, disconnect };
}
