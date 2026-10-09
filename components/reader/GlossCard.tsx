"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Copy, CornerDownRight, RotateCcw, Sparkles, Square, Trash2 } from "lucide-react";
import { ACTIONS } from "@/lib/actions";
import { followUp, retry, stopGloss } from "@/lib/ask";
import { MODELS } from "@/lib/models";
import { useStore, type Gloss, type Turn } from "@/lib/store";
import { undash } from "@/lib/article";
import { Answer } from "./Answer";
import { Writing } from "./Writing";
import { fmtCost, fmtTokens, useReader } from "./context";

type Props = {
  gloss: Gloss;
  active: boolean;
  hover: boolean;
  entering: boolean;
  /** "margin" cards are absolutely placed; "sheet" and "list" flow normally. */
  variant: "margin" | "sheet" | "list";
  top?: number;
  onActivate: () => void;
};

function Receipt({ t }: { t: Turn }) {
  if (t.mode === "demo") return <span>Demo output. Add a Together key for real answers.</span>;
  if (!t.usage) return <span>{t.model}</span>;
  const u = t.usage;
  return (
    <span title={`${u.promptTokens.toLocaleString()} prompt tokens, ${u.cachedTokens.toLocaleString()} served from cache, ${u.completionTokens} written`}>
      {t.model}
      <span className="mx-1.5 text-ink-4/70">/</span>
      {fmtTokens(u.promptTokens)} in{u.cachedTokens > 0 ? ` (${Math.round((u.cachedTokens / Math.max(1, u.promptTokens)) * 100)}% cached)` : ""}, {u.completionTokens} out
      <span className="mx-1.5 text-ink-4/70">/</span>
      {fmtCost(u.costUsd)}
    </span>
  );
}


function TurnBody({ t }: { t: Turn }) {
  if (t.error && !t.content) return <p className="text-[13.5px] text-rubric-text">{t.error}</p>;
  if (t.streaming && !t.content) return <Writing />;
  return (
    <>
      <Answer text={t.content} streaming={t.streaming} />
      {t.error && <p className="mt-2 text-[12.5px] text-rubric-text">{t.error}</p>}
    </>
  );
}

export const GlossCard = forwardRef<HTMLElement, Props>(function GlossCard({ gloss, active, hover, entering, variant, top, onActivate }, ref) {
  const { ix, jumpToBlock } = useReader();
  const removeGloss = useStore((s) => s.removeGloss);
  const setUI = useStore((s) => s.setUI);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const first = gloss.turns[0];
  const last = gloss.turns[gloss.turns.length - 1];
  const busy = gloss.turns.some((t) => t.streaming);
  const collapsed = variant === "margin" && !active;
  const blockId = gloss.anchor?.start.b ?? gloss.at;
  const n = blockId ? ix.numbers.get(blockId) : undefined;
  const nEnd = gloss.anchor ? ix.numbers.get(gloss.anchor.end.b) : undefined;
  const label = gloss.anchor ? ACTIONS[gloss.action].label : "Whole text";

  useEffect(() => {
    if (entering) {
      const t = setTimeout(() => setUI({ enteringGloss: null }), 600);
      return () => clearTimeout(t);
    }
  }, [entering, setUI]);

  const submit = () => {
    const q = draft.trim();
    if (!q || busy) return;
    followUp(ix, gloss.id, q);
    setDraft("");
  };

  const copy = async () => {
    const text = gloss.turns
      .filter((t) => t.content)
      .map((t) => (t.role === "user" ? `Q: ${t.content}` : undash(t.content)))
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(gloss.anchor ? `“${gloss.anchor.quote}”\n\n${text}` : text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };

  const style = variant === "margin" ? { transform: `translateY(${Math.round(top ?? 0)}px)` } : undefined;

  return (
    <article
      ref={ref}
      data-gloss={gloss.id}
      aria-label={`${label} gloss${n ? ` on paragraph ${n}` : ""}`}
      className={[
        variant === "margin" ? "gloss" : "gloss !relative !transform-none",
        active ? "is-active" : "",
        hover ? "is-hover" : "",
        collapsed ? "is-collapsed cursor-pointer" : "",
        entering ? "is-entering" : "",
      ].join(" ")}
      style={style}
      onClick={() => !active && onActivate()}
      onMouseEnter={() => setUI({ hoverGloss: gloss.id })}
      onMouseLeave={() => setUI({ hoverGloss: null })}
    >
      <header className="mb-1.5 flex items-center gap-2 text-[12px] leading-none">
        <span className="font-semibold text-rubric-text">{label}</span>
        {n !== undefined && (
          <button
            type="button"
            className="cite !text-[11px]"
            onClick={(e) => {
              e.stopPropagation();
              if (blockId) jumpToBlock(blockId);
            }}
            aria-label={`Go to paragraph ${n}`}
          >
            ¶{n}
            {nEnd && nEnd !== n ? `-${nEnd}` : ""}
          </button>
        )}
        {gloss.turns.length > 2 && <span className="text-ink-3">{Math.floor(gloss.turns.length / 2)} follow-up{gloss.turns.length > 3 ? "s" : ""}</span>}
        <span className="ml-auto text-[11px] text-ink-4">{first.modelKey ? MODELS[first.modelKey].short : ""}</span>
      </header>

      {!collapsed && gloss.anchor && gloss.action !== "ask" && (
        <p className="mb-2.5 line-clamp-2 border-l-2 border-[var(--rubric-line)] pl-2.5 font-serif text-[15px] leading-snug text-ink-3">{gloss.anchor.quote}</p>
      )}
      {gloss.question && <p className={`mb-1.5 text-[14px] font-medium leading-snug text-ink ${collapsed ? "line-clamp-1" : ""}`}>{gloss.question}</p>}

      <div className="gloss-body">
        <TurnBody t={first} />
      </div>

      {!collapsed &&
        gloss.turns.slice(1).map((t, i) =>
          t.role === "user" ? (
            <p key={i} className="mt-3.5 flex gap-1.5 border-t border-rule pt-3 text-[13.5px] font-medium leading-snug text-ink">
              <CornerDownRight size={14} className="mt-[2px] shrink-0 text-ink-4" aria-hidden />
              {t.content}
            </p>
          ) : (
            <div key={i} className="gloss-body mt-1.5">
              <TurnBody t={t} />
            </div>
          )
        )}

      {active && variant !== "list" && (
        <>
          <footer className="mt-3 flex items-center gap-1 text-ink-3">
            <span className="min-w-0 flex-1 truncate text-[11.5px] tabular-nums text-ink-4">
              <Receipt t={last.role === "assistant" ? last : first} />
            </span>
            {busy ? (
              <IconBtn label="Stop" onClick={() => stopGloss(gloss.id)}>
                <Square size={12} fill="currentColor" />
              </IconBtn>
            ) : (
              <>
                {last.modelKey !== "pro" && (
                  <IconBtn label="Ask the deeper model to try" onClick={() => retry(ix, gloss.id, "pro")}>
                    <Sparkles size={14} />
                  </IconBtn>
                )}
                <IconBtn label="Try again" onClick={() => retry(ix, gloss.id)}>
                  <RotateCcw size={14} />
                </IconBtn>
                <IconBtn label="Copy" onClick={copy}>
                  {copied ? <Check size={14} className="text-good" /> : <Copy size={14} />}
                </IconBtn>
                <IconBtn
                  label="Delete gloss"
                  onClick={() => {
                    stopGloss(gloss.id);
                    removeGloss(gloss.articleId, gloss.id);
                  }}
                >
                  <Trash2 size={14} />
                </IconBtn>
              </>
            )}
          </footer>
          <form
            className="mt-2.5 flex items-center gap-1.5 rounded-[10px] border border-rule bg-bg px-2.5 transition-colors focus-within:border-rule-strong"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  inputRef.current?.blur();
                }
              }}
              placeholder="Ask a follow-up"
              aria-label="Ask a follow-up"
              className="h-9 min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none focus-visible:outline-none placeholder:text-ink-4"
            />
            <button
              type="submit"
              disabled={!draft.trim() || busy}
              aria-label="Send follow-up"
              className="grid size-6 place-items-center rounded-md bg-ink text-bg transition-opacity disabled:opacity-20"
            >
              <ArrowUp size={14} strokeWidth={2.4} />
            </button>
          </form>
        </>
      )}
    </article>
  );
});

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="grid size-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-sunk hover:text-ink"
    >
      {children}
    </button>
  );
}
