"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, RotateCcw, TextCursor } from "lucide-react";
import { ABOUT_DOC } from "@/lib/about";
import { ACTION_QUESTIONS, ACTIONS, type Action } from "@/lib/actions";
import { streamAsk } from "@/lib/ask";
import { Answer } from "@/components/reader/Answer";
import { Writing } from "@/components/reader/Writing";

const DEMO_QUOTE = "any line";
const DEMO_QUESTION = "how does this work?";
const DEMO_NOTE =
  "Select a line in any article, PDF or book, then type a question. The answer appears here, in the margin, beside the words it explains, with links to the paragraphs it used.";

/**
 * The demo, in phases: 1 a cursor arrives, 2 it drags across the phrase,
 * 3 a question is typed, 4 the pen underlines the phrase and carries the
 * answer into the margin, 5 it is the reader's turn.
 */
type Phase = 0 | 1 | 2 | 3 | 4 | 5;
type Note = { quote: string; question: string; text: string; streaming: boolean; error?: string; demo: boolean };
type Line = { x0: number; x1: number; y: number };
type Geo = { noteTop: number; ruleX: number; lines: Line[]; width: number; leader: { x0: number; y0: number; x1: number; y1: number; gap: boolean } | null };

const DEMO: Note = { quote: DEMO_QUOTE, question: "How does this work?", text: DEMO_NOTE, streaming: false, demo: true };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const short = (s: string) => (s.length > 34 ? s.slice(0, 32).trimEnd() + "…" : s);

/** Client rects of the text a range covers, without the boxes of the elements around it. */
function textRects(range: Range): DOMRect[] {
  const root = range.commonAncestorContainer;
  if (root.nodeType === Node.TEXT_NODE) return Array.from(range.getClientRects());
  const out: DOMRect[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!range.intersectsNode(n) || n.parentElement?.closest(".demo-lens")) continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    if (n === range.startContainer) r.setStart(n, range.startOffset);
    if (n === range.endContainer) r.setEnd(n, range.endOffset);
    out.push(...Array.from(r.getClientRects()));
  }
  return out;
}

/** One box per visual line. */
function toLines(rects: DOMRect[], fs: number) {
  const out: { left: number; right: number; top: number; bottom: number }[] = [];
  for (const r of rects) {
    if (r.width < 1) continue;
    const cy = (r.top + r.bottom) / 2;
    const l = out.find((o) => Math.abs((o.top + o.bottom) / 2 - cy) < fs * 0.4);
    if (l) {
      l.left = Math.min(l.left, r.left);
      l.right = Math.max(l.right, r.right);
      l.top = Math.min(l.top, r.top);
      l.bottom = Math.max(l.bottom, r.bottom);
    } else out.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
  }
  return out.sort((a, b) => a.top - b.top);
}

/** Words that arrive one after another, like ink taking. */
function Words({ text, start = 0, step = 11 }: { text: string; start?: number; step?: number }) {
  return (
    <>
      {text.split(/(\s+)/).map((w, i) =>
        /^\s+$/.test(w) ? (
          w
        ) : (
          <span key={i} className="ink-word" style={{ animationDelay: `${start + i * step}ms` }}>
            {w}
          </span>
        )
      )}
    </>
  );
}

/**
 * The headline glosses itself. On load it plays the whole interaction once:
 * a phrase is selected, a question is typed, and the pen carries the answer
 * into the margin. Then it is real: select any words in the headline and ask.
 */
export function Hero({ children }: { children: ReactNode }) {
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>(0);
  const [typed, setTyped] = useState("");
  const [sent, setSent] = useState(false);
  const [note, setNote] = useState<Note>(DEMO);
  const [stroke, setStroke] = useState(0);
  const [geo, setGeo] = useState<Geo>({ noteTop: 0, ruleX: 0, lines: [], width: 3, leader: null });
  const [live, setLive] = useState<Range | null>(null);
  const [lens, setLens] = useState<null | { range: Range; quote: string; mode: "actions" | "ask"; x: number; y: number }>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lensMode = useRef<"actions" | "ask" | null>(null);
  lensMode.current = lens?.mode ?? null;

  /* ---------- the demonstration ---------- */
  const play = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    abort.current?.abort();
    setLive(null);
    setNote(DEMO);
    setTyped("");
    setSent(false);
    setPhase(0);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase(5);
      setStroke((k) => k + 1);
      return;
    }
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    at(450, () => setPhase(1)); // a text cursor arrives
    at(850, () => setPhase(2)); // and drags across the phrase
    at(1700, () => setPhase(3)); // the lens opens
    const t0 = 1950;
    DEMO_QUESTION.split("").forEach((_, i) => at(t0 + i * 46, () => setTyped(DEMO_QUESTION.slice(0, i + 1))));
    const asked = t0 + DEMO_QUESTION.length * 46 + 260;
    at(asked, () => setSent(true));
    at(asked + 240, () => {
      setPhase(4); // underline, leader, note
      setStroke((k) => k + 1);
    });
    at(asked + 2600, () => setPhase(5));
  }, []);

  useEffect(() => {
    play();
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, [play]);

  /* ---------- geometry: the pen's line under the words and out to the note ---------- */
  const measure = useCallback(() => {
    const sec = sectionRef.current;
    const col = colRef.current;
    const h1 = titleRef.current;
    const noteEl = noteRef.current;
    if (!sec || !col || !h1) return;
    const s = sec.getBoundingClientRect();
    const c = col.getBoundingClientRect();
    const fs = parseFloat(getComputedStyle(h1).fontSize);
    let target = live;
    if (!target && markRef.current?.firstChild) {
      target = document.createRange();
      target.selectNodeContents(markRef.current.firstChild);
    }
    const boxes = target ? toLines(textRects(target), fs) : [];
    const lines = boxes.map((b) => ({ x0: b.left - s.left, x1: b.right - s.left, y: b.bottom - s.top - fs * 0.07 }));
    const wide = window.innerWidth >= 1024;
    const noteTop = wide && boxes[0] ? Math.max(0, boxes[0].top - c.top + fs * 0.1) : 0;
    const anchor = noteEl?.querySelector("[data-anchor]")?.getBoundingClientRect();
    const n = noteEl?.getBoundingClientRect();
    const last = lines[lines.length - 1];
    // Like the reader's gutter: the leader never crosses words. If more of the line follows
    // the selection than a full stop, it starts past the end of the line instead.
    let x0 = last?.x1 ?? 0;
    if (last) {
      const all = document.createRange();
      all.selectNodeContents(h1);
      const row = toLines(textRects(all), fs).find((b) => Math.abs(b.bottom - s.top - fs * 0.07 - last.y) < fs * 0.4);
      const rest = row ? row.right - s.left - last.x1 : 0;
      if (rest > fs * 0.4) x0 = row!.right - s.left + fs * 0.12;
    }
    const leader =
      wide && last && n && anchor
        ? { x0, y0: last.y, x1: c.left - s.left + 1, y1: c.top - s.top + noteTop + (anchor.top - n.top) + anchor.height / 2, gap: x0 > last.x1 + 1 }
        : null;
    setGeo({ noteTop, ruleX: c.left - s.left - 40, lines, width: Math.max(2.5, fs * 0.032), leader: leader && leader.x1 - leader.x0 > 40 ? leader : null });
  }, [live]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(() => requestAnimationFrame(measure));
    if (sectionRef.current) ro.observe(sectionRef.current);
    if (noteRef.current) ro.observe(noteRef.current);
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, phase]);

  /* ---------- try it for real: select anything in the headline ---------- */
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const read = () => {
      if (lensMode.current === "ask") return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const zone = (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)?.closest("[data-try]");
      if (!zone) return;
      const quote = range.toString().replace(/\s+/g, " ").trim();
      if (!quote || quote.length > 400) return;
      const r = range.getBoundingClientRect();
      setLens({ range: range.cloneRange(), quote, mode: "actions", x: r.left + r.width / 2, y: r.top });
      setDraft("");
    };
    const onSel = () => {
      if (t) clearTimeout(t);
      t = setTimeout(read, 160);
    };
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest(".hero-lens")) return;
      setLens(null);
    };
    document.addEventListener("selectionchange", onSel);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("selectionchange", onSel);
      document.removeEventListener("pointerdown", onDown);
      if (t) clearTimeout(t);
    };
  }, []);

  const toAsk = useCallback((initial: string) => {
    setDraft(initial);
    setLens((l) => (l ? { ...l, mode: "ask" } : l));
    lensMode.current = "ask";
    window.getSelection()?.removeAllRanges();
  }, []);

  // Focus the question the moment the lens turns into an input, caret after what was typed.
  const asking = lens?.mode === "ask";
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!asking || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [asking]);

  // Typing while text is selected starts the question, exactly like the reader.
  useEffect(() => {
    if (!lens || lens.mode !== "actions") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "Escape") return setLens(null);
      if (e.key === "Enter") {
        e.preventDefault();
        toAsk("");
      } else if (e.key.length === 1 && e.key !== " ") {
        e.preventDefault();
        e.stopPropagation();
        toAsk(e.key);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [lens, toAsk]);

  // While a question is being typed, keep the chosen words visibly selected.
  useEffect(() => {
    const reg = (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights;
    const H = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
    if (!reg || !H) return;
    if (lens?.mode === "ask") reg.set("hero-pending", new H(lens.range));
    else reg.delete("hero-pending");
  }, [lens]);

  // Wash the live passage with the CSS Custom Highlight API, no DOM surgery.
  useEffect(() => {
    const reg = (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights;
    const H = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
    if (!reg || !H) return;
    if (live) reg.set("hero-gloss", new H(live));
    else reg.delete("hero-gloss");
    return () => void reg.delete("hero-gloss");
  }, [live]);

  const ask = (action: Action, question?: string) => {
    if (!lens) return;
    timers.current.forEach(clearTimeout);
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setLive(lens.range);
    setPhase(5);
    setStroke((k) => k + 1);
    setNote({ quote: lens.quote, question: question ? cap(question) : ACTION_QUESTIONS[action], text: "", streaming: true, demo: false });
    window.getSelection()?.removeAllRanges();
    setLens(null);
    void streamAsk(
      { doc: ABOUT_DOC, length: "short", thread: { action, quote: lens.quote, question } },
      {
        text: (full) => setNote((n) => ({ ...n, text: full })),
        error: (msg) => setNote((n) => ({ ...n, error: msg, streaming: false })),
      },
      ctrl.signal
    ).finally(() => setNote((n) => ({ ...n, streaming: false })));
  };

  const backToExample = () => {
    abort.current?.abort();
    setLive(null);
    setNote(DEMO);
    setPhase(5);
    setStroke((k) => k + 1);
  };

  const demoRunning = !live && phase >= 2 && phase <= 3;
  const demoGlossed = !live && phase >= 4;
  const lensWidth = lens?.mode === "ask" ? 380 : 300;
  const L = geo.leader;
  const lineDelay = (i: number) => i * 110;
  const leaderDelay = lineDelay(geo.lines.length - 1) + 380;

  return (
    <section ref={sectionRef} className="relative mx-auto grid w-full max-w-[1320px] items-start gap-x-20 gap-y-8 px-6 sm:px-10 lg:grid-cols-[minmax(0,1fr)_296px]">
      {/* The red margin rule of a notebook page. */}
      <span aria-hidden className="margin-rule pointer-events-none absolute -bottom-[60vh] -top-[60vh] hidden w-px lg:block" style={{ left: geo.ruleX }} />

      <div className="min-w-0">
        <h1 ref={titleRef} data-try className="hero-title font-serif text-ink">
          <span className="block">
            Highlight{" "}
            <span ref={markRef} className={`demo-mark ${demoRunning ? "is-sel" : ""} ${demoGlossed ? "is-gloss" : ""}`}>
              {DEMO_QUOTE}
              {(phase === 1 || phase === 2) && !live && (
                <span className={`demo-ibeam ${phase === 2 ? "is-drag" : ""}`} aria-hidden>
                  <svg viewBox="0 0 14 26" fill="none">
                    <path d="M3 2.5c2.4 0 4 .9 4 3v15c0 2.1 1.6 3 4 3M11 2.5c-2.4 0-4 .9-4 3v15c0 2.1-1.6 3-4 3" stroke="var(--bg)" strokeWidth="4.2" strokeLinecap="round" />
                    <path d="M3 2.5c2.4 0 4 .9 4 3v15c0 2.1 1.6 3 4 3M11 2.5c-2.4 0-4 .9-4 3v15c0 2.1-1.6 3-4 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                </span>
              )}
              {(phase === 3 || (phase === 4 && !live)) && (
                <span className={`demo-lens ${phase === 4 ? "is-out" : ""}`} aria-hidden>
                  <span className="font-medium">Ask</span>
                  <span className="min-w-0 flex-1 truncate text-lens-mute">
                    {typed}
                    {!sent && <span className="demo-caret" />}
                  </span>
                  <span className={`demo-send ${sent ? "is-sent" : ""}`}>
                    <ArrowUp size={13} strokeWidth={2.6} />
                  </span>
                </span>
              )}
            </span>
            .
          </span>
          <span className="block">Ask it anything.</span>
        </h1>
        {children}
      </div>

      <div ref={colRef} className="relative min-h-[1px]">
        <div ref={noteRef} style={{ marginTop: geo.noteTop }} className={`hero-note ${phase >= 4 ? "is-in" : ""}`} aria-live="polite">
          <p data-anchor className="flex items-center gap-1.5 text-[12.5px] leading-none text-ink-3">
            On <span className="truncate font-serif text-[14px] italic text-ink-2">&ldquo;{short(note.quote)}&rdquo;</span>
          </p>
          <h2 key={`q${stroke}`} className="mt-3 font-serif text-[22px] font-[420] leading-[1.15] tracking-[-0.012em] text-ink [font-variation-settings:'opsz'_36]">
            <Words text={note.question} start={note.demo ? 520 : 0} step={18} />
          </h2>
          <div className="gloss-body mt-2.5 !text-[14.5px] !leading-[1.62] text-ink-2">
            {note.error ? (
              <p className="text-rubric-text">{note.error}</p>
            ) : note.demo ? (
              <p key={`a${stroke}`}>
                <Words text={note.text} start={720} />
              </p>
            ) : note.text ? (
              <Answer text={note.text} streaming={note.streaming} plain />
            ) : (
              <Writing />
            )}
          </div>

          <div className={`hero-foot mt-5 flex items-center gap-2 border-t border-rule pt-3.5 text-[12.5px] leading-snug ${phase >= 5 && !note.streaming ? "is-in" : ""}`}>
            {note.demo ? (
              <>
                <TextCursor size={14} className="shrink-0 text-rubric-text" aria-hidden />
                <span className="flex-1 text-ink-2">Your turn: select any word.</span>
                <button
                  type="button"
                  onClick={play}
                  title="Play the example again"
                  aria-label="Play the example again"
                  className="grid size-7 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-sunk hover:text-ink"
                >
                  <RotateCcw size={13} />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-ink-3">Answered from a page about Gloss.</span>
                <button type="button" onClick={backToExample} className="shrink-0 text-ink-3 underline decoration-rule-strong underline-offset-4 transition-colors hover:text-ink">
                  Clear
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {phase >= 4 && geo.lines.length > 0 && (
        <svg key={stroke} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          {geo.lines.map((l, i) => (
            <path key={i} className="pen-line" pathLength={1} strokeWidth={geo.width} d={`M ${l.x0} ${l.y} L ${l.x1} ${l.y}`} style={{ animationDelay: `${lineDelay(i)}ms` }} />
          ))}
          {L && (
            <>
              <path
                className="pen-leader"
                pathLength={1}
                d={`M ${L.x0} ${L.y0} C ${L.x0 + (L.x1 - L.x0) * 0.5} ${L.y0}, ${L.x1 - (L.x1 - L.x0) * 0.42} ${L.y1}, ${L.x1} ${L.y1}`}
                style={{ animationDelay: `${leaderDelay}ms` }}
              />
              {L.gap && <circle className="pen-dot" cx={L.x0} cy={L.y0} r={3} style={{ animationDelay: `${leaderDelay - 60}ms` }} />}
              <circle className="pen-dot" cx={L.x1} cy={L.y1} r={3.5} style={{ animationDelay: `${leaderDelay + 620}ms` }} />
            </>
          )}
        </svg>
      )}

      {lens && (
        <div
          className="hero-lens lens fixed z-50"
          style={{ left: Math.max(12, Math.min(window.innerWidth - lensWidth - 12, lens.x - lensWidth / 2)), top: Math.max(12, lens.y - 54) }}
          onMouseDown={(e) => (e.target as HTMLElement).tagName !== "INPUT" && e.preventDefault()}
        >
          <div className="rounded-[13px] bg-lens p-1 text-lens-fg shadow-pop" style={{ width: lensWidth }}>
            {lens.mode === "actions" ? (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => toAsk("")}
                  className="flex h-8 items-center gap-2 rounded-[9px] pl-2.5 pr-2 text-[13px] font-medium hover:bg-lens-hover"
                >
                  Ask <span className="text-[12px] font-normal text-lens-mute">or just type</span>
                </button>
                <span className="mx-1 h-4 w-px bg-lens-mute/30" />
                {(["explain", "define"] as Action[]).map((a) => (
                  <button key={a} type="button" onClick={() => ask(a)} className="h-8 rounded-[9px] px-2.5 text-[13px] hover:bg-lens-hover">
                    {ACTIONS[a].label}
                  </button>
                ))}
              </div>
            ) : (
              <form
                className="flex items-center gap-1.5 pl-2.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.trim()) ask("ask", draft.trim());
                }}
              >
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setLens(null)}
                  placeholder="Ask about this"
                  aria-label="Ask about the highlighted words"
                  className="h-8 min-w-0 flex-1 bg-transparent text-[14px] text-lens-fg outline-none placeholder:text-lens-mute focus-visible:outline-none"
                />
                <button type="submit" disabled={!draft.trim()} aria-label="Ask" className="grid size-8 place-items-center rounded-[9px] bg-[var(--rubric)] text-white disabled:opacity-30">
                  <ArrowUp size={16} strokeWidth={2.4} />
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
