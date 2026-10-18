"use client";

import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { Check, Headphones, LoaderCircle, Pause, Play, Square } from "lucide-react";
import { blockEl } from "@/lib/anchor";
import { blockText, type Block } from "@/lib/article";
import type { DocIndex } from "@/lib/doc";
import { useStore } from "@/lib/store";
import { DEFAULT_LANG, DEFAULT_VOICE, isVoice, isVoiceLang, TTS_MAX_CHARS, VOICE_LANGS, VOICES, type VoiceId, type VoiceLang } from "@/lib/voice";
import { barBtn } from "@/components/ui/Popover";
import { useReader } from "./context";

/**
 * Read aloud. The text is spoken a passage at a time from where you are, each
 * clip fetched a little ahead of the voice, and the paragraph being read is
 * marked like the keyboard cursor so the eye can follow along. The voice is
 * Sarvam Bulbul, on the app's key: the reader picks a voice and a language.
 */

type Status = "idle" | "loading" | "playing" | "paused" | "error";
type ListenState = { status: Status; block: string | null; rate: number; voice: VoiceId; lang: VoiceLang; error?: string };

const RATES = [1, 1.2, 1.4, 1.7, 2, 0.8];
const RATE_KEY = "gloss:listen-rate";
const VOICE_KEY = "gloss:listen-voice";

const useListen = create<ListenState>(() => ({ status: "idle", block: null, rate: 1, voice: DEFAULT_VOICE, lang: DEFAULT_LANG }));

/**
 * Paragraphs are split at sentence ends. The very first clip is one sentence and
 * the next one short, so the voice starts quickly and the clip after it is ready in time.
 */
function chunks(text: string, first: boolean): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["'”’)\]]*\s*|[^.!?]+$/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    const limit = first && out.length === 0 ? 1 : first && out.length === 1 ? 400 : TTS_MAX_CHARS;
    if (cur && (cur + s).length > limit) {
      out.push(cur.trim());
      cur = "";
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.flatMap((c) => (c.length > TTS_MAX_CHARS ? c.match(new RegExp(`[\\s\\S]{1,${TTS_MAX_CHARS}}`, "g")) ?? [] : [c]));
}

const SPOKEN = new Set<Block["type"]>(["p", "h2", "h3", "quote", "li", "note"]);

/** A few hundred milliseconds of silence, played inside the click so phones let the voice play later. */
function silence(): string {
  const n = 800;
  const b = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  b.setUint32(4, 36 + n * 2, true);
  str(8, "WAVEfmt ");
  b.setUint32(16, 16, true);
  b.setUint16(20, 1, true);
  b.setUint16(22, 1, true);
  b.setUint32(24, 8000, true);
  b.setUint32(28, 16000, true);
  b.setUint16(32, 2, true);
  b.setUint16(34, 16, true);
  str(36, "data");
  b.setUint32(40, n * 2, true);
  let bin = "";
  new Uint8Array(b.buffer).forEach((x) => (bin += String.fromCharCode(x)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

/* ---------------- the engine: one voice at a time ---------------- */

let items: { block: string; text: string }[] = [];
let idx = 0;
let session = 0;
let audio: HTMLAudioElement | null = null;
let ctrl: AbortController | null = null;
const clips = new Map<number, Promise<string>>();
const urls = new Map<number, string>();

async function speak(i: number): Promise<Response> {
  const { voice, lang } = useListen.getState();
  const r = await fetch("/api/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: items[i].text, voice, lang }),
    signal: ctrl?.signal,
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? "The voice did not answer.");
  }
  return r;
}

/** Where the browser can, a clip nobody fetched ahead plays while it is still arriving. */
const canStream = () => typeof MediaSource !== "undefined" && MediaSource.isTypeSupported("audio/mpeg");

async function streamed(i: number): Promise<string> {
  const r = await speak(i);
  const ms = new MediaSource();
  const url = URL.createObjectURL(ms);
  urls.set(i, url);
  const body = r.body;
  ms.addEventListener(
    "sourceopen",
    async () => {
      if (!body) return ms.endOfStream("network");
      const sb = ms.addSourceBuffer("audio/mpeg");
      const reader = body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (ms.readyState !== "open") return void reader.cancel();
          sb.appendBuffer(value);
          await new Promise((ok) => sb.addEventListener("updateend", ok, { once: true }));
        }
        if (ms.readyState === "open") ms.endOfStream();
      } catch {
        if (ms.readyState === "open") ms.endOfStream("network");
      }
    },
    { once: true },
  );
  return url;
}

function clip(i: number): Promise<string> {
  let p = clips.get(i);
  if (!p) {
    p = speak(i).then(async (r) => {
      const url = URL.createObjectURL(await r.blob());
      urls.set(i, url);
      return url;
    });
    // A failed clip is forgotten, so "Try again" fetches it afresh.
    p.catch(() => clips.get(i) === p && clips.delete(i));
    clips.set(i, p);
  }
  return p;
}

function release(upTo: number) {
  for (const [i, url] of urls) {
    if (i < upTo) {
      URL.revokeObjectURL(url);
      urls.delete(i);
      clips.delete(i);
    }
  }
}

async function playAt(i: number, s: number) {
  if (s !== session || !audio) return;
  if (i >= items.length) return stopListening();
  idx = i;
  const ready = urls.has(i);
  useListen.setState({ block: items[i].block, ...(ready ? {} : { status: "loading" }) });
  let url: string;
  try {
    url = ready || clips.has(i) || !canStream() ? await clip(i) : await streamed(i);
  } catch (e) {
    if (s === session) useListen.setState({ status: "error", error: e instanceof Error ? e.message : "The voice did not answer." });
    return;
  }
  if (s !== session || !audio) return;
  void clip(i + 1 < items.length ? i + 1 : i);
  if (i + 2 < items.length) void clip(i + 2);
  release(i - 1);
  audio.src = url;
  audio.playbackRate = useListen.getState().rate;
  try {
    await audio.play();
    if (s === session) useListen.setState({ status: "playing" });
  } catch {
    if (s === session) useListen.setState({ status: "paused" });
  }
}

export function startListening(ix: DocIndex, fromBlock: string | null) {
  stopListening();
  const blocks = ix.article.blocks;
  const at = Math.max(0, fromBlock ? blocks.findIndex((b) => b.id === fromBlock) : 0);
  let first = true;
  items = [];
  for (const b of blocks.slice(at)) {
    if (!SPOKEN.has(b.type)) continue;
    const t = blockText(b).trim();
    if (!t) continue;
    for (const c of chunks(t, first)) items.push({ block: b.id, text: c });
    first = false;
  }
  if (!items.length) return;

  audio ??= new Audio();
  // Only a spoken clip ending moves on; the unlocking silence ending must not.
  audio.onended = () => audio?.src.startsWith("blob:") && void playAt(idx + 1, session);
  // A clip that breaks off mid-stream stops here; "Try again" fetches it afresh.
  audio.onerror = () => audio?.src.startsWith("blob:") && useListen.setState({ status: "error", error: "The voice broke off." });
  // Unlock playback inside the click: later clips arrive after an await.
  audio.src = silence();
  audio.play().catch(() => {});

  ctrl = new AbortController();
  const s = ++session;
  try {
    const r = Number(localStorage.getItem(RATE_KEY));
    if (RATES.includes(r)) useListen.setState({ rate: r });
    const v = JSON.parse(localStorage.getItem(VOICE_KEY) ?? "{}") as { voice?: string; lang?: string };
    if (isVoice(v.voice)) useListen.setState({ voice: v.voice });
    if (isVoiceLang(v.lang)) useListen.setState({ lang: v.lang });
  } catch {}
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: ix.article.title, artist: ix.article.author ?? ix.article.source ?? "Gloss" });
    navigator.mediaSession.setActionHandler("play", () => toggleListening());
    navigator.mediaSession.setActionHandler("pause", () => toggleListening());
  }
  void playAt(0, s);
}

export function stopListening() {
  session++;
  ctrl?.abort();
  ctrl = null;
  if (audio) {
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.removeAttribute("src");
  }
  release(Infinity);
  clips.clear();
  items = [];
  useListen.setState({ status: "idle", block: null, error: undefined });
}

function toggleListening() {
  const { status } = useListen.getState();
  if (!audio) return;
  if (status === "playing") {
    audio.pause();
    useListen.setState({ status: "paused" });
  } else if (status === "paused") {
    audio.play().then(() => useListen.setState({ status: "playing" })).catch(() => {});
  } else if (status === "error") {
    useListen.setState({ error: undefined });
    void playAt(idx, session);
  }
}

function cycleRate() {
  const { rate } = useListen.getState();
  const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
  useListen.setState({ rate: next });
  if (audio) audio.playbackRate = next;
  try {
    localStorage.setItem(RATE_KEY, String(next));
  } catch {}
}

/** A new voice or language takes over from the paragraph being read. */
function pickVoice(ix: DocIndex, next: { voice?: VoiceId; lang?: VoiceLang }) {
  useListen.setState(next);
  const { voice, lang, block } = useListen.getState();
  try {
    localStorage.setItem(VOICE_KEY, JSON.stringify({ voice, lang }));
  } catch {}
  startListening(ix, block);
}

/* ---------------- the controls ---------------- */

/** In the top bar, only when Listen is on in settings. Starts from the paragraph you are on. */
export function ListenButton({ from }: { from: () => string | null }) {
  const { ix } = useReader();
  const on = useStore((s) => s.settings.listen);
  const status = useListen((s) => s.status);
  if (!on) return null;
  const active = status !== "idle";
  return (
    <button
      type="button"
      className={`${barBtn} ${active ? "bg-sunk text-ink" : ""}`}
      aria-label={active ? "Stop reading aloud" : "Read aloud from here"}
      aria-pressed={active}
      data-tip={active ? "Stop reading aloud" : "Read aloud from here"}
      onClick={() => {
        if (active) return stopListening();
        // The paragraph cursor when it is on screen, otherwise the first paragraph in view.
        const cursor = useStore.getState().cursor;
        const r = cursor ? blockEl(cursor)?.getBoundingClientRect() : null;
        startListening(ix, r && r.bottom > 0 && r.top < window.innerHeight ? cursor : from());
      }}
    >
      <Headphones size={16} strokeWidth={1.8} />
    </button>
  );
}

/** While the voice is reading: a small bar just above the question box, and the cursor on the paragraph being read. */
export function ListenBar() {
  const { ix, jumpToBlock } = useReader();
  const { status, block, rate, voice, lang, error } = useListen();
  const on = useStore((s) => s.settings.listen);
  const setUI = useStore((s) => s.setUI);
  const prev = useRef<string | null>(null);

  // Leaving the text, or switching Listen off, stops the voice.
  useEffect(() => () => stopListening(), [ix]);
  useEffect(() => {
    if (!on) stopListening();
  }, [on]);

  // Follow the voice, but only while the reader is following too.
  useEffect(() => {
    if (!block) {
      prev.current = null;
      return;
    }
    setUI({ cursor: block });
    const was = prev.current ? blockEl(prev.current)?.getBoundingClientRect() : null;
    const following = !was || (was.bottom > 0 && was.top < window.innerHeight);
    const r = blockEl(block)?.getBoundingClientRect();
    if (following && r && (r.top < 80 || r.bottom > window.innerHeight * 0.8)) jumpToBlock(block, { flash: false });
    prev.current = block;
  }, [block, jumpToBlock, setUI]);

  if (status === "idle") return null;
  const n = block ? ix.numbers.get(block) : undefined;

  return (
    <div
      role="region"
      aria-label="Reading aloud"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+80px)] left-1/2 sm:bottom-[calc(env(safe-area-inset-bottom)+90px)] z-[46] flex -translate-x-1/2 items-center gap-1 rounded-full bg-lens p-1 text-lens-fg shadow-pop ring-1 ring-black/5"
      style={{ animation: "rise 0.35s var(--ease-out) both" }}
    >
      <button
        type="button"
        onClick={toggleListening}
        aria-label={status === "playing" ? "Pause" : status === "error" ? "Try again" : "Play"}
        className="grid size-9 place-items-center rounded-full bg-[var(--rubric)] text-white transition-transform active:scale-90"
      >
        {status === "loading" ? (
          <LoaderCircle size={16} className="animate-spin" />
        ) : status === "playing" ? (
          <Pause size={15} fill="currentColor" strokeWidth={0} />
        ) : (
          <Play size={15} fill="currentColor" strokeWidth={0} className="translate-x-px" />
        )}
      </button>
      {status === "error" ? (
        <span className="max-w-[min(360px,50vw)] truncate px-2 text-[13px]" title={error}>
          {error}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => block && jumpToBlock(block, { flash: false })}
          className="h-9 rounded-full px-2.5 text-[13px] tabular-nums text-lens-fg/85 transition-colors hover:bg-lens-hover hover:text-lens-fg"
          aria-label={n ? `Reading paragraph ${n}. Show it.` : "Show where it is reading"}
        >
          {n ? `Reading ¶${n}` : "Reading"}
        </button>
      )}
      <button
        type="button"
        onClick={cycleRate}
        aria-label={`Speed ${rate} times. Change speed.`}
        className="h-9 min-w-[48px] rounded-full px-2.5 text-[13px] font-medium tabular-nums transition-colors hover:bg-lens-hover"
      >
        {`${rate}×`}
      </button>
      <VoiceMenu voice={voice} lang={lang} onPick={(next) => pickVoice(ix, next)} />
      <button type="button" onClick={stopListening} aria-label="Stop reading aloud" className="grid size-9 place-items-center rounded-full text-lens-fg/80 transition-colors hover:bg-lens-hover hover:text-lens-fg">
        <Square size={13} fill="currentColor" strokeWidth={0} />
      </button>
    </div>
  );
}

/** The voice, by name, opening upward from the bar. The reading language sits last, small. */
function VoiceMenu({ voice, lang, onPick }: { voice: VoiceId; lang: VoiceLang; onPick: (next: { voice?: VoiceId; lang?: VoiceLang }) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = VOICES.find((v) => v.id === voice)?.name ?? "Voice";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const pick = (next: { voice?: VoiceId; lang?: VoiceLang }) => {
    setOpen(false);
    onPick(next);
  };
  const row = "flex h-8 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left text-[13px] transition-colors hover:bg-lens-hover";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Voice: ${name}. Change voice.`}
        aria-expanded={open}
        aria-haspopup="menu"
        className="h-9 rounded-full px-2.5 text-[13px] font-medium transition-colors hover:bg-lens-hover"
      >
        {name}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Voice"
          className="absolute bottom-[calc(100%+10px)] right-0 w-[200px] rounded-2xl bg-lens p-1.5 text-lens-fg shadow-pop ring-1 ring-black/5"
          style={{ animation: "rise 0.2s var(--ease-out) both" }}
        >
          {VOICES.map((v) => (
            <button key={v.id} type="button" role="menuitemradio" aria-checked={v.id === voice} onClick={() => pick({ voice: v.id })} className={row}>
              <span>{v.name}</span>
              {v.id === voice && <Check size={14} strokeWidth={2} />}
            </button>
          ))}
          <label className="mt-1 flex items-center justify-between gap-2 border-t border-lens-hover px-2.5 pb-1 pt-2 text-[12px] text-lens-mute">
            <span>Language</span>
            <select
              value={lang}
              onChange={(e) => pick({ lang: e.target.value as VoiceLang })}
              className="rounded-md bg-transparent py-0.5 text-[12px] text-lens-fg/85 outline-none hover:bg-lens-hover"
            >
              {VOICE_LANGS.map((l) => (
                <option key={l.code} value={l.code} className="text-black">
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
