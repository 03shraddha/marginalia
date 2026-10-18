"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { keyHeaders, openKeyMenu } from "@/lib/ask";
import type { StreamEvent } from "@/lib/models";
import { MarginText } from "./MarginText";
import { EXAMPLE, PRESET, SAMPLE } from "./sample";

const PARAS = SAMPLE.paras.map((text, i) => ({ n: i + 1, text }));

type Span = { n: number; start: number; end: number };
type Answer = {
  status: "example" | "waiting" | "streaming" | "done" | "error";
  text: string;
  quote: string;
  error?: string;
  needKey?: boolean;
};

const presetText = PARAS[PRESET.n - 1].text;
const PRESET_SPAN: Span = { n: PRESET.n, start: presetText.indexOf(PRESET.phrase), end: presetText.indexOf(PRESET.phrase) + PRESET.phrase.length };

/**
 * A small live demo on the sample reading. Select a phrase and an answer
 * streams into the margin from /api/ask. It starts with one already there.
 */
export function LiveDemo() {
  const [span, setSpan] = useState<Span>(PRESET_SPAN);
  const [answer, setAnswer] = useState<Answer>({ status: "example", text: EXAMPLE, quote: PRESET.phrase });
  const [cardY, setCardY] = useState(0);
  const colRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const ctrl = useRef<AbortController | null>(null);
  const spanRef = useRef(span);
  spanRef.current = span;
  const statusRef = useRef(answer.status);
  statusRef.current = answer.status;

  const ask = useCallback(async (s: Span) => {
    const quote = PARAS[s.n - 1].text.slice(s.start, s.end);
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setSpan(s);
    setAnswer({ status: "waiting", text: "", quote });
    let text = "";
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...keyHeaders() },
        signal: c.signal,
        body: JSON.stringify({
          length: "short",
          search: false,
          doc: { title: SAMPLE.title, author: "Microsoft AI", published: "October 15, 2026", paras: PARAS },
          thread: { action: "explain", quote, from: s.n, to: s.n },
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
        if (needKey) openKeyMenu();
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
            text += e.text;
            setAnswer({ status: "streaming", text, quote });
          } else if (e.type === "reset") {
            text = "";
          } else if (e.type === "error") {
            setAnswer({ status: "error", text, quote, error: e.text });
            return;
          }
        }
      }
      setAnswer({ status: text.trim() ? "done" : "error", text, quote, error: text.trim() ? undefined : "No answer came back. Try again." });
    } catch (err) {
      if (c.signal.aborted) return;
      setAnswer({ status: "error", text, quote, error: `Connection lost: ${String(err)}` });
    }
  }, []);

  useEffect(() => () => ctrl.current?.abort(), []);

  // A selection inside a paragraph asks about it, once the hand lets go.
  useEffect(() => {
    let down = false;
    let touch = false;
    let timer = 0;
    const read = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const r = sel.getRangeAt(0);
      const el = (r.startContainer.parentElement ?? null)?.closest<HTMLElement>("[data-n]");
      if (!el || !el.contains(r.endContainer)) return;
      const n = Number(el.dataset.n);
      const text = PARAS[n - 1].text;
      const pre = document.createRange();
      pre.selectNodeContents(el);
      pre.setEnd(r.startContainer, r.startOffset);
      let start = pre.toString().length;
      let end = start + r.toString().length;
      while (start < end && /\s/.test(text[start])) start++;
      while (end > start && /\s/.test(text[end - 1])) end--;
      if (end - start < 2) return;
      end = Math.min(end, start + 600);
      const cur = spanRef.current;
      sel.removeAllRanges();
      if (cur.n === n && cur.start === start && cur.end === end && statusRef.current !== "example") return;
      void ask({ n, start, end });
    };
    const settle = () => {
      clearTimeout(timer);
      timer = window.setTimeout(read, touch ? 650 : 120);
    };
    const onDown = (e: PointerEvent) => {
      touch = e.pointerType === "touch";
      down = Boolean((e.target as HTMLElement).closest?.("[data-n]"));
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
  }, [ask]);

  // On a wide screen the card sits level with the words it answers.
  useLayoutEffect(() => {
    const place = () => {
      const m = markRef.current;
      const card = cardRef.current;
      const col = colRef.current;
      if (!m || !card || !col || !window.matchMedia("(min-width: 820px)").matches) return setCardY(0);
      const y = m.getBoundingClientRect().top - col.getBoundingClientRect().top - 6;
      setCardY(Math.max(0, Math.min(y, Math.max(0, col.offsetHeight - card.offsetHeight))));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [span, answer.text, answer.status]);

  const busy = answer.status === "waiting" || answer.status === "streaming";

  return (
    <div className="lp-demo">
      <div className="lp-demo-col" ref={colRef}>
        <p className="lp-kicker">{SAMPLE.kicker}</p>
        <h2 className="lp-demo-title">{SAMPLE.title}</h2>
        {PARAS.map((p) => (
          <div className="lp-para" key={p.n}>
            <span className="lp-pnum" aria-hidden>
              ¶{p.n}
            </span>
            <p data-n={p.n}>
              {span.n === p.n ? (
                <>
                  {p.text.slice(0, span.start)}
                  <mark
                    ref={markRef}
                    className={`lp-sel${busy ? " is-busy" : ""}`}
                    tabIndex={answer.status === "example" ? 0 : -1}
                    role={answer.status === "example" ? "button" : undefined}
                    aria-label={answer.status === "example" ? "Ask about this line" : undefined}
                    onClick={() => answer.status === "example" && void ask(span)}
                    onKeyDown={(e) => {
                      if (answer.status === "example" && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        void ask(span);
                      }
                    }}
                  >
                    {p.text.slice(span.start, span.end)}
                  </mark>
                  {p.text.slice(span.end)}
                </>
              ) : (
                p.text
              )}
            </p>
          </div>
        ))}
      </div>

      <aside className="lp-margin" aria-label="Margin note" aria-live="polite" aria-busy={busy}>
        <div ref={cardRef} className="lp-card" style={{ ["--y" as string]: `${cardY}px` }}>
          <p className="lp-card-quote">
            <span className="lp-card-tag">¶{span.n}</span>“{answer.quote.length > 80 ? `${answer.quote.slice(0, 78).trim()}…` : answer.quote}”
          </p>
          <div className="lp-card-body">
            {answer.status === "waiting" ? (
              <p className="lp-thinking">
                <span />
                <span />
                <span />
                <span className="sr-only">Writing an answer</span>
              </p>
            ) : answer.status === "error" && !answer.text ? (
              <p className="lp-card-error">{answer.error}</p>
            ) : (
              <MarginText text={answer.text} caret={answer.status === "streaming"} />
            )}
          </div>
          <footer className="lp-card-foot">
            {answer.status === "example" ? (
              <span>Select any line above to ask your own.</span>
            ) : answer.status === "error" ? (
              <>
                {answer.needKey && (
                  <button type="button" className="lp-link" onClick={openKeyMenu}>
                    Add your API key
                  </button>
                )}
                <button type="button" className="lp-link" onClick={() => void ask(span)}>
                  <RotateCcw size={12} aria-hidden /> Try again
                </button>
              </>
            ) : (
              <span>{busy ? "Writing" : "Answered from the paragraphs cited"}</span>
            )}
          </footer>
        </div>
      </aside>
    </div>
  );
}
