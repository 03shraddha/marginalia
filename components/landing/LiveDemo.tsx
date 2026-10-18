"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight, RotateCcw, Sparkles } from "lucide-react";
import { openKeyMenu, readApiKey } from "@/lib/ask";
import type { StreamEvent } from "@/lib/models";
import { sampleById } from "@/lib/samples";
import { MarginText } from "./MarginText";
import { MODEL_LINE } from "./name";

const article = sampleById("walden-reading")!;
const PARAS = article.blocks.filter((b) => b.type === "p").map((b, i) => ({ n: i + 1, text: (b.runs ?? []).map((r) => r.text).join("") }));

/** The paragraph on the desk: ¶7 of Walden's "Reading". */
const N = 7;
const TEXT = PARAS[N - 1].text;
const PHRASE = "astrologically, not astronomically";
const PRESET = { start: TEXT.indexOf(PHRASE), end: TEXT.indexOf(PHRASE) + PHRASE.length };

export const DEMO = { id: article.id, title: article.title, author: article.author ?? "", published: article.published ?? "", book: "Walden" };

/** Written by hand, so the page has an answer before anyone asks. */
const EXAMPLE = `==He means reading for signs, not for understanding.== An astrologer scans the stars for omens about his own life. An astronomer studies them as they are [¶7]. Thoreau wants the second kind: reading you must "stand on tip-toe" for [¶7]. He set up the image earlier, where great books are the stars that "they who can may read" [¶4].`;

type Span = { start: number; end: number };
type Answer = {
  status: "example" | "waiting" | "streaming" | "done" | "error";
  text: string;
  quote: string;
  firstMs?: number;
  totalMs?: number;
  error?: string;
  needKey?: boolean;
};

const secs = (ms: number) => `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;

/**
 * The hero: one real paragraph and its margin. Select any phrase and a live
 * answer streams into the margin card from /api/ask, timed in the browser.
 */
export function LiveDemo() {
  const [span, setSpan] = useState<Span>(PRESET);
  const [answer, setAnswer] = useState<Answer>({ status: "example", text: EXAMPLE, quote: PHRASE });
  const [tried, setTried] = useState(false);
  const [open, setOpen] = useState(true);
  const [cardY, setCardY] = useState(0);
  const textRef = useRef<HTMLParagraphElement>(null);
  const markRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const ctrl = useRef<AbortController | null>(null);
  const spanRef = useRef(span);
  spanRef.current = span;

  const ask = useCallback(async (s: Span) => {
    const quote = TEXT.slice(s.start, s.end);
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setSpan(s);
    setTried(true);
    setOpen(true);
    setAnswer({ status: "waiting", text: "", quote });
    const t0 = performance.now();
    let first: number | undefined;
    let text = "";
    try {
      const apiKey = readApiKey();
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: c.signal,
        body: JSON.stringify({
          apiKey: apiKey || undefined,
          length: "short",
          search: false,
          doc: { title: article.title, author: article.author, published: article.published, paras: PARAS },
          thread: { action: "explain", quote, from: N, to: N },
        }),
      });
      if (!res.ok || !res.body) {
        let error = `Request failed (${res.status}).`;
        let needKey = false;
        try {
          const j = (await res.json()) as { error?: string; code?: string };
          error = j.error ?? error;
          needKey = j.code === "need_key";
        } catch {}
        setAnswer({ status: "error", text: "", quote, error, needKey });
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const f of frames) {
          if (!f.startsWith("data:")) continue;
          let e: StreamEvent;
          try {
            e = JSON.parse(f.slice(5).trim());
          } catch {
            continue;
          }
          if (e.type === "content") {
            if (first === undefined && e.text.trim()) first = performance.now() - t0;
            text += e.text;
            setAnswer({ status: "streaming", text, quote, firstMs: first });
          } else if (e.type === "reset") {
            text = "";
          } else if (e.type === "error") {
            setAnswer({ status: "error", text, quote, error: e.text });
            return;
          }
        }
      }
      setAnswer({ status: text.trim() ? "done" : "error", text, quote, firstMs: first, totalMs: performance.now() - t0, error: text.trim() ? undefined : "No answer came back. Try again." });
    } catch (err) {
      if (c.signal.aborted) return;
      setAnswer({ status: "error", text, quote, error: `Connection lost: ${String(err)}` });
    }
  }, []);

  useEffect(() => () => ctrl.current?.abort(), []);

  // A selection inside the paragraph asks about it, once the hand lets go.
  useEffect(() => {
    let down = false;
    let touch = false;
    let timer = 0;
    const read = () => {
      const el = textRef.current;
      const sel = window.getSelection();
      if (!el || !sel || sel.isCollapsed || !sel.rangeCount) return;
      const r = sel.getRangeAt(0);
      if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return;
      const pre = document.createRange();
      pre.selectNodeContents(el);
      pre.setEnd(r.startContainer, r.startOffset);
      let start = pre.toString().length;
      let end = start + r.toString().length;
      while (start < end && /\s/.test(TEXT[start])) start++;
      while (end > start && /\s/.test(TEXT[end - 1])) end--;
      if (end - start < 2) return;
      end = Math.min(end, start + 600);
      const cur = spanRef.current;
      sel.removeAllRanges();
      if (cur.start === start && cur.end === end && answer.status !== "example") return;
      void ask({ start, end });
    };
    const settle = () => {
      clearTimeout(timer);
      timer = window.setTimeout(read, touch ? 650 : 120);
    };
    const onDown = (e: PointerEvent) => {
      touch = e.pointerType === "touch";
      down = Boolean(textRef.current?.contains(e.target as Node));
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      settle();
    };
    const onSel = () => {
      if (!down) settle();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    document.addEventListener("selectionchange", onSel);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.removeEventListener("selectionchange", onSel);
    };
  }, [ask, answer.status]);

  // On a wide screen the card sits level with the words it answers.
  useLayoutEffect(() => {
    const place = () => {
      const m = markRef.current;
      const card = cardRef.current;
      const col = colRef.current;
      if (!m || !card || !col || !window.matchMedia("(min-width: 768px)").matches) return setCardY(0);
      const y = m.offsetTop - 18;
      const room = col.offsetHeight - card.offsetHeight;
      setCardY(Math.max(0, Math.min(y, room)));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [span, answer.text, answer.status]);

  const before = TEXT.slice(0, span.start);
  const marked = TEXT.slice(span.start, span.end);
  const after = TEXT.slice(span.end);
  const busy = answer.status === "waiting" || answer.status === "streaming";

  return (
    <div className="mg-demo">
      <div className="mg-demo-col" ref={colRef}>
        <header className="mg-demo-head">
          <p className="mg-kicker">
            {DEMO.book}, {DEMO.published}
          </p>
          <h2 className="mg-demo-title">{DEMO.title}</h2>
          <p className="mg-byline">{DEMO.author}</p>
        </header>
        <div className="mg-demo-para">
          <span className="mg-pnum" aria-hidden>
            ¶{N}
          </span>
          <p ref={textRef} className="mg-demo-text">
            {before}
            <mark
              ref={markRef}
              className={`mg-sel${busy ? " is-busy" : ""}`}
              // A pseudo-element, so the hint never counts in the paragraph's offsets.
              data-hint={tried ? undefined : "Select any line. Try it."}
              tabIndex={answer.status === "example" ? 0 : -1}
              role={answer.status === "example" ? "button" : undefined}
              aria-label={answer.status === "example" ? `Ask about "${marked}"` : undefined}
              onClick={() => answer.status === "example" && ask(span)}
              onKeyDown={(e) => {
                if (answer.status === "example" && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  void ask(span);
                }
              }}
            >
              {marked}
            </mark>
            {after}
          </p>
        </div>
        <p className="mg-demo-more">
          <Link href={`/read/${DEMO.id}`} className="mg-textlink">
            Read all of “{DEMO.title}” <ArrowUpRight size={14} aria-hidden />
          </Link>
        </p>
      </div>

      <aside className="mg-margin" aria-label="Margin note" aria-live="polite" aria-busy={busy}>
        <div ref={cardRef} className={`mg-card${open ? "" : " is-folded"}`} style={{ ["--y" as string]: `${cardY}px` }}>
          <button type="button" className="mg-grabber" onClick={() => setOpen((v) => !v)} aria-label={open ? "Fold the answer" : "Show the answer"} aria-expanded={open}>
            <span aria-hidden />
          </button>
          <p className="mg-card-quote">
            <span className="mg-card-tag">¶{N} · Explain</span>“{answer.quote.length > 90 ? `${answer.quote.slice(0, 88).trim()}…` : answer.quote}”
          </p>
          <div className="mg-card-body">
            {answer.status === "waiting" ? (
              <p className="mg-thinking">
                <span />
                <span />
                <span />
                <span className="sr-only">Writing an answer</span>
              </p>
            ) : answer.status === "error" && !answer.text ? (
              <p className="mg-card-error">{answer.error}</p>
            ) : (
              <MarginText text={answer.text} caret={answer.status === "streaming"} />
            )}
          </div>
          <footer className="mg-card-foot">
            {answer.status === "example" ? (
              <>
                <span>Example answer</span>
                <button type="button" className="mg-chipbtn" onClick={() => ask(span)}>
                  <Sparkles size={13} aria-hidden /> Ask it live
                </button>
              </>
            ) : answer.status === "error" ? (
              <>
                {answer.needKey ? (
                  <button type="button" className="mg-chipbtn" onClick={openKeyMenu}>
                    Add your key
                  </button>
                ) : (
                  <span>{answer.text ? answer.error : "Something went wrong."}</span>
                )}
                <button type="button" className="mg-chipbtn" onClick={() => ask(span)}>
                  <RotateCcw size={13} aria-hidden /> Try again
                </button>
              </>
            ) : (
              <>
                <span className="mg-speed" title={MODEL_LINE}>
                  <span className={`mg-dot${busy ? " is-live" : ""}`} aria-hidden />
                  {answer.firstMs !== undefined ? `first word in ${secs(answer.firstMs)}` : "asking"}
                  {answer.totalMs !== undefined && <span className="mg-speed-total"> · done in {secs(answer.totalMs)}</span>}
                </span>
                <span className="mg-model">{MODEL_LINE}</span>
              </>
            )}
          </footer>
        </div>
      </aside>
    </div>
  );
}
