"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { ARTICLE_QUESTIONS } from "@/lib/actions";
import { startGloss } from "@/lib/ask";
import { useReader } from "./context";
import { WebSwitch } from "./WebSwitch";
import { VoiceAsk } from "./VoiceAsk";

export type ComposerHandle = { focus: () => void };

/**
 * Ask about the whole text. The answer is written in the margin beside the
 * paragraph you were reading when you asked, so it stays where your head was.
 */
export const Composer = forwardRef<ComposerHandle, { currentBlock: () => string | null; suggestions?: string[] }>(function Composer(
  { currentBlock, suggestions = ARTICLE_QUESTIONS },
  ref
) {
  const { ix } = useReader();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  const ask = (question: string) => {
    const text = question.trim();
    if (!text) return;
    startGloss(ix, { at: currentBlock() ?? undefined, action: "ask", question: text });
    setQ("");
    inputRef.current?.blur();
  };

  return (
    <div className="composer focus-hide pointer-events-none sticky bottom-4 z-30 mt-20 sm:bottom-6">
      {focused && !q && (
        <div className="pointer-events-auto mb-2 flex flex-wrap justify-center gap-1.5" style={{ animation: "rise 0.3s var(--ease-out) both" }}>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => ask(s)}
              className="material rounded-full px-3.5 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink max-sm:min-h-[36px]"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className={`material pointer-events-auto mx-auto flex max-w-[34rem] items-center gap-2 rounded-full py-1.5 pl-5 pr-1.5 transition-[box-shadow,max-width] duration-300 ease-[var(--ease-out)] ${
          focused ? "max-w-[38rem] !shadow-[0_0_0_3.5px_color-mix(in_srgb,var(--accent)_40%,transparent),var(--shadow-pop)]" : ""
        }`}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              inputRef.current?.blur();
            }
          }}
          placeholder="Ask about this text"
          aria-label="Ask anything about the whole text"
          className="h-9 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none focus-visible:outline-none placeholder:text-ink-3 max-sm:h-11"
        />
        {!focused && !q && <kbd className="hidden sm:inline">/</kbd>}
        {/* Voice and web search stay out of sight until the box is in use, so the resting screen is one line. */}
        {(focused || q) && (
          <span className="flex items-center gap-2" onMouseDown={(e) => e.preventDefault()}>
            <VoiceAsk
              onText={(t) => {
                setQ((prev) => (prev.trim() ? `${prev.trimEnd()} ${t}` : t));
                inputRef.current?.focus();
              }}
            />
            <WebSwitch />
          </span>
        )}
        <button
          type="submit"
          disabled={!q.trim()}
          aria-label="Ask"
          data-tip="Ask"
          data-tip-kbd={"\u21b5"}
          className="btn-accent size-9 shrink-0 max-sm:size-11"
        >
          <ArrowUp size={17} strokeWidth={2.3} />
        </button>
      </form>
    </div>
  );
});
