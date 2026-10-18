"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, Square } from "lucide-react";
import { keyHeaders, openKeyMenu } from "@/lib/ask";

/** Saaras' sync endpoint takes 30 s at most; stop a little before that. */
const MAX_MS = 29_000;
/** A press longer than this is push-to-talk: letting go sends. A shorter one is a tap: tap again to send. */
const HOLD_MS = 350;
const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];

type Phase = "idle" | "starting" | "recording" | "transcribing";

function pickType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

function micError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access is off. Allow it in your browser's site settings to ask by voice.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone found.";
  if (name === "NotReadableError") return "Another app is using the microphone.";
  return "Could not start the microphone.";
}

function clock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Ask by voice. Hold to talk and let go, or tap to start and tap to stop;
 * Escape cancels. The speech is transcribed (language detected automatically)
 * and lands in the box beside it, to edit and send. Shows nothing where the
 * browser cannot record.
 */
export function VoiceAsk({ onText, tone = "plain" }: { onText: (text: string) => void; tone?: "plain" | "lens" }) {
  const [supported, setSupported] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const pressRef = useRef<{ at: number; startedHere: boolean } | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    setSupported(typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    abortRef.current?.abort();
    stop();
    release();
    setPhase("idle");
  }, [release, stop]);

  const send = useCallback(async (blob: Blob) => {
    setPhase("transcribing");
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const form = new FormData();
      form.append("file", blob, "question");
      const res = await fetch("/api/transcribe", { method: "POST", headers: keyHeaders(), body: form, signal: ac.signal });
      const j = (await res.json().catch(() => ({}))) as { text?: string; error?: string; code?: string };
      if (!res.ok && j.code === "need_key") openKeyMenu();
      if (!res.ok) throw new Error(j.error || "Could not transcribe that.");
      const text = (j.text ?? "").trim();
      if (!text) setError("Heard nothing. Try again, a little closer to the mic.");
      else onTextRef.current(text);
    } catch (e) {
      if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Could not transcribe that.");
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setPhase("idle");
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setPhase("starting");
    cancelledRef.current = false;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      setError(micError(e));
      setPhase("idle");
      return;
    }
    if (cancelledRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const type = pickType();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setError("This browser cannot record audio here.");
      setPhase("idle");
      return;
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      release();
      if (cancelledRef.current) return;
      const blob = new Blob(chunks, { type: rec.mimeType || type || "audio/webm" });
      if (blob.size < 1000) {
        setError("That was too short. Hold on a moment longer.");
        setPhase("idle");
        return;
      }
      void send(blob);
    };
    streamRef.current = stream;
    recRef.current = rec;
    rec.start();
    setElapsed(0);
    setPhase("recording");
  }, [release, send]);

  // The clock, and the hard stop at the API's limit.
  useEffect(() => {
    if (phase !== "recording") return;
    const t0 = Date.now();
    const id = window.setInterval(() => {
      const ms = Date.now() - t0;
      setElapsed(ms);
      if (ms >= MAX_MS) stop();
    }, 200);
    return () => window.clearInterval(id);
  }, [phase, stop]);

  // Escape cancels before the box or the lens sees it.
  useEffect(() => {
    if (phase === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      cancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [phase, cancel]);

  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => setError(null), 6000);
    return () => window.clearTimeout(id);
  }, [error]);

  useEffect(() => () => cancel(), [cancel]);

  if (!supported) return null;

  const recording = phase === "recording";
  const busy = phase === "starting" || phase === "transcribing";
  const label = recording ? "Stop" : phase === "transcribing" ? "Transcribing" : "Ask by voice";

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || busy) return;
    e.preventDefault();
    if (recording) {
      pressRef.current = { at: Date.now(), startedHere: false };
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    pressRef.current = { at: Date.now(), startedHere: true };
    void start();
  };
  const onPointerUp = () => {
    const press = pressRef.current;
    pressRef.current = null;
    if (!press) return;
    // A tap while recording stops. A long hold that started the recording stops on release.
    // A release before the mic opened (say, at the permission prompt) counts as a tap, so recording goes on.
    if (!press.startedHere || (recRef.current?.state === "recording" && Date.now() - press.at >= HOLD_MS)) stop();
  };

  return (
    <span className={`voice-ask ${tone === "lens" ? "voice-ask--lens" : ""}`} data-phase={phase}>
      {recording && (
        <span className="voice-ask__live" role="status" aria-live="polite">
          <span className="voice-ask__dot" aria-hidden />
          <span className="voice-ask__time">{clock(elapsed)}</span>
          <span className="voice-ask__hint">Esc to cancel</span>
        </span>
      )}
      <button
        type="button"
        aria-label={label}
        aria-pressed={recording}
        data-tip={label}
        data-tip-hint={recording ? "Tap to stop. Up to 30 seconds." : phase === "idle" ? "Hold to talk, or tap to start" : undefined}
        disabled={busy}
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
            e.preventDefault();
            if (recording) stop();
            else if (!busy) void start();
          }
        }}
        className="voice-ask__btn"
      >
        {phase === "transcribing" ? (
          <LoaderCircle size={15} strokeWidth={2.2} className="voice-ask__spin" aria-hidden />
        ) : recording ? (
          <Square size={11} strokeWidth={0} fill="currentColor" aria-hidden />
        ) : (
          <Mic size={15} strokeWidth={2.1} aria-hidden />
        )}
      </button>
      {error && (
        <span className="voice-ask__error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
