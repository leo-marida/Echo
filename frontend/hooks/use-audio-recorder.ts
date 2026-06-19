import { useRef, useState, useCallback } from "react";

const SAMPLE_RATE = 24000;

function float32ToPCM16(float32Array: Float32Array): ArrayBuffer {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16.buffer;
}

export function useAudioRecorder(onChunk: (pcm16: ArrayBuffer) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    streamRef.current = stream;

    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    contextRef.current = ctx;

    const source = ctx.createMediaStreamSource(stream);
    // ScriptProcessorNode fires every bufferSize samples. bufferSize MUST be a power
    // of two between 256–16384 — the naive (SAMPLE_RATE * CHUNK_INTERVAL_MS) / 1000
    // = 2400 is not valid and throws IndexSizeError on every call, in every browser.
    // 2048 is the closest valid size (~85ms @ 24kHz vs. the intended ~100ms).
    const bufferSize = 2048;
    const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      const float32 = e.inputBuffer.getChannelData(0);
      const pcm16 = float32ToPCM16(float32);
      onChunk(pcm16);
    };

    source.connect(processor);
    processor.connect(ctx.destination);
    setIsRecording(true);
  }, [onChunk]);

  const stop = useCallback(() => {
    processorRef.current?.disconnect();
    contextRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setIsRecording(false);
  }, []);

  return { isRecording, start, stop };
}
