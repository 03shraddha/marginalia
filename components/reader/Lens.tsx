"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, BadgeCheck, BookA, Check, Copy, Ellipsis, Eraser, Feather, Highlighter, Lightbulb, Scale, Waypoints, type LucideIcon } from "lucide-react";
import { ACTIONS, isShortSelection, type Action } from "@/lib/actions";
import { MARKERS, type Marker } from "@/lib/settings";
import { anchorToRange, selectionToAnchor } from "@/lib/anchor";
import { startGloss } from "@/lib/ask";
import { uid, useStore, type Anchor } from "@/lib/store";
import { useReader } from "./context";
import { ModelSwitch } from "./ModelSwitch";

type LensState = {
  anchor: Anchor;
  mode: "actions" | "ask";
  highlightId?: string;
  initial?: string;
};

const ICONS: Partial<Record<Action, LucideIcon>> = {
  explain: Lightbulb,
  define: BookA,
  simplify: Feather,
  check: BadgeCheck,
  connect: Waypoints,
  counter: Scale,
};

/** Questions people reach for, offered while the box is still empty. */
const STARTERS = {
  word: ["Why this word here?", "Where does it come from?", "Use it in a sentence"],
  passage: ["Give me an example", "Why does it matter?", "What is the evidence?"],
};

/**
 * The selection lens. Select text and it appears; start typing and it becomes
 * a question box; pick an action and the answer is written in the margin.
 */
export function Lens({ rootEl, openHighlight }: { rootEl: HTMLElement | null; openHighlight: { id: string; anchor: Anchor; at: number } | null }) {
  const { ix } = useReader();
  const [lens, setLens] = useState<LensState | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean; arrow: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [menu, setMenu] = useState(false);
  const marker = useStore((s) => s.settings.marker);
  const setSettings = useStore((s) => s.setSettings);
  const updateHighlight = useStore((s) => s.updateHighlight);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);
  const lensRef = useRef<LensState | null>(null);
  lensRef.current = lens;
  const setUI = useStore((s) => s.setUI);
  const addHighlight = useStore((s) => s.addHighlight);
  const removeHighlight = useStore((s) => s.removeHighlight);

  const close = useCallback(
    (clearSelection = true) => {
      setLens(null);
      setPos(null);
      setDraft("");
      setMenu(false);
      setUI({ pending: null, activeHighlight: null });
      if (clearSelection) window.getSelection()?.removeAllRanges();
    },
    [setUI]
  );

  // Read the selection after a drag ends or the keyboard changes it.
  useEffect(() => {
    if (!rootEl) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const evaluate = () => {
      if (lensRef.current?.mode === "ask") return;
      const a = selectionToAnchor(window.getSelection(), rootEl, ix.texts, ix.order);
      if (a) {
        setLens({ anchor: a, mode: "actions" });
        setUI({ activeHighlight: null });
      } else if (lensRef.current && !lensRef.current.highlightId) {
        setLens(null);
        setPos(null);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (boxRef.current?.contains(e.target as Node)) return;
      dragging.current = rootEl.contains(e.target as Node);
      if (lensRef.current?.mode === "ask" || lensRef.current?.highlightId) close(false);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      if (t) clearTimeout(t);
      t = setTimeout(evaluate, 10);
    };
    const onSel = () => {
      if (dragging.current) return;
      if (t) clearTimeout(t);
      t = setTimeout(evaluate, 140);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("selectionchange", onSel);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("selectionchange", onSel);
      if (t) clearTimeout(t);
    };
  }, [rootEl, ix, close, setUI]);

  // Clicking an existing highlight opens the lens on it.
  useEffect(() => {
    if (!openHighlight) return;
    window.getSelection()?.removeAllRanges();
    setLens({ anchor: openHighlight.anchor, mode: "actions", highlightId: openHighlight.id });
    setUI({ activeHighlight: openHighlight.id });
  }, [openHighlight, setUI]);

  // Follow the anchor while the page scrolls.
  // keepX: the box only changed size (colour dots, starters), so it stays put sideways.
  const lastX = useRef<number | null>(null);
  const place = useCallback((keepX = false) => {
    const l = lensRef.current;
    const box = boxRef.current;
    if (!l || !box) return;
    const sel = window.getSelection();
    const range = l.mode === "actions" && !l.highlightId && sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : anchorToRange(l.anchor);
    const rects = range ? Array.from(range.getClientRects()).filter((r) => r.width > 0) : [];
    if (!rects.length) return;
    const first = rects[0];
    const lastR = rects[rects.length - 1];
    const vw = window.innerWidth;
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const centerX = rects.length > 1 ? (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2 : (first.left + first.right) / 2;
    const anchorX = rects.length > 1 ? first.left + Math.min(40, first.width / 2) : centerX;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let below = coarse || first.top - h - 12 < 64;
    let y = below ? lastR.bottom + 12 : first.top - h - 12;
    if (below && y + h > window.innerHeight - 8) {
      below = false;
      y = Math.max(64, first.top - h - 12);
    }
    const ideal = keepX && lastX.current !== null ? lastX.current : (rects.length > 1 ? centerX : anchorX) - w / 2;
    const x = Math.max(12, Math.min(vw - w - 12, ideal));
    lastX.current = ideal;
    const arrowAt = below ? (lastR.left + lastR.right) / 2 : anchorX;
    setPos({ x, y, below, arrow: Math.max(16, Math.min(w - 16, arrowAt - x)) });
  }, []);

  useLayoutEffect(() => {
    if (!lens) return;
    place();
    const ro = new ResizeObserver(() => place(true));
    if (boxRef.current) ro.observe(boxRef.current);
    const on = () => requestAnimationFrame(() => place(true));
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, [lens, place]);

  const toAsk = useCallback(
    (initial = "") => {
      const l = lensRef.current;
      if (!l) return;
      setDraft(initial);
      setLens({ ...l, mode: "ask" });
      setMenu(false);
      if (!l.highlightId) setUI({ pending: l.anchor });
      window.getSelection()?.removeAllRanges();
    },
    [setUI]
  );

  const asking = lens?.mode === "ask";
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!asking || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [asking]);

  // Typing anything while text is selected starts a question.
  useEffect(() => {
    if (!lens || lens.mode !== "actions") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tgt = e.target as HTMLElement;
      if (tgt.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (menu) setMenu(false);
        else close();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        toAsk("");
        return;
      }
      if (e.key.length === 1 && e.key !== " ") {
        e.preventDefault();
        e.stopPropagation();
        toAsk(e.key);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [lens, menu, close, toAsk]);

  if (!lens) return null;

  const run = (action: Action, question?: string) => {
    startGloss(ix, { anchor: lens.anchor, action, question });
    close();
  };

  const short = isShortSelection(lens.anchor.quote);
  const primary: Action[] = ["explain", short ? "define" : "simplify"];
  const more: Action[] = [short ? "simplify" : "define", "check", "connect", "counter"];
  const existing = lens.highlightId ? useStore.getState().highlights[ix.article.id]?.find((h) => h.id === lens.highlightId) : undefined;
  const markerColor = MARKERS.find((m) => m.key === marker)?.color;

  // Captions open on the side away from the text, so they never cover what was selected.
  const tipProps = (label: string, hint?: string) => ({
    "data-tip": label,
    "data-tip-hint": hint,
    "data-tip-side": pos?.below ? "bottom" : "top",
  });

  const highlight = (color: Marker) => {
    if (color !== marker) setSettings({ marker: color });
    if (existing) {
      updateHighlight(ix.article.id, existing.id, { color });
    } else {
      addHighlight({ id: uid(), articleId: ix.article.id, anchor: lens.anchor, createdAt: Date.now(), color });
    }
    close();
  };

  const copy = async () => {
    const n = ix.numbers.get(lens.anchor.start.b);
    try {
      await navigator.clipboard.writeText(`\u201c${lens.anchor.quote}\u201d (${ix.article.title}${n ? `, \u00b6${n}` : ""})`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  const style = pos ? { left: pos.x, top: pos.y } : { left: -9999, top: -9999 };
  // Captions and the menu open on the side away from the text.
  const outside = pos?.below ? "top-[calc(100%+8px)]" : "bottom-[calc(100%+8px)]";
  const starters = short ? STARTERS.word : STARTERS.passage;

  return (
    <div
      ref={boxRef}
      role={lens.mode === "ask" ? "dialog" : "toolbar"}
      aria-label={lens.mode === "ask" ? "Ask about the selection" : "Actions for the selection"}
      className="lens fixed z-50"
      data-tip-tone="paper"
      style={{ ...style, ["--origin" as string]: pos?.below ? "top center" : "bottom center" }}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).tagName !== "INPUT") e.preventDefault();
      }}
    >
      <div className="relative rounded-[14px] bg-lens p-1 text-lens-fg shadow-pop ring-1 ring-black/5">
        {lens.mode === "actions" ? (
          <div className="no-scrollbar flex max-w-[calc(100vw-24px)] items-center gap-0.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => toAsk("")}
              {...tipProps("Ask", "Or just start typing")}
              className="lens-btn group gap-2 pl-3 pr-2.5 font-medium"
            >
              Ask
              <span className="lens-caret" aria-hidden />
            </button>
            <span className="mx-[3px] h-4 w-px shrink-0 bg-lens-mute/30" aria-hidden />
            {primary.map((a) => {
              const Icon = ICONS[a]!;
              return (
                <button key={a} type="button" onClick={() => run(a)} {...tipProps(ACTIONS[a].label, ACTIONS[a].hint)} className="lens-btn group gap-1.5 pl-2.5 pr-3">
                  <Icon size={15} strokeWidth={1.9} className="text-lens-mute transition-colors group-hover:text-lens-fg" aria-hidden />
                  {ACTIONS[a].label}
                </button>
              );
            })}
            <button
              type="button"
              aria-label="More actions"
              aria-expanded={menu}
              onClick={() => setMenu((v) => !v)}
              {...tipProps("More", "Fact-check, related, counterpoint")}
              className={`lens-btn w-8 justify-center ${menu ? "bg-lens-hover" : ""}`}
            >
              <Ellipsis size={16} />
            </button>
            <span className="mx-[3px] h-4 w-px shrink-0 bg-lens-mute/30" aria-hidden />

            {existing ? (
              <>
                <div className="flex items-center gap-2 px-2" role="radiogroup" aria-label="Highlight colour">
                  {MARKERS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      role="radio"
                      aria-checked={(existing.color ?? "yellow") === m.key}
                      aria-label={`${m.label} highlight`}
                      onClick={() => highlight(m.key)}
                      {...tipProps(m.label)}
                      className={`lens-dot ${(existing.color ?? "yellow") === m.key ? "is-on" : ""}`}
                      style={{ background: m.color }}
                    />
                  ))}
                </div>
                <LensIcon
                  label="Remove highlight"
                  tip={tipProps("Remove highlight")}
                  onClick={() => {
                    removeHighlight(ix.article.id, lens.highlightId!);
                    close();
                  }}
                >
                  <Eraser size={15} />
                </LensIcon>
              </>
            ) : (
              <div className="group/hl flex items-center">
                <LensIcon label="Highlight" tip={tipProps("Highlight", "Hover for colours")} onClick={() => highlight(marker)}>
                  <span className="relative">
                    <Highlighter size={15} />
                    <span aria-hidden className="absolute -bottom-[3px] -right-[3px] size-[7px] rounded-full ring-2 ring-[var(--lens-bg)]" style={{ background: markerColor }} />
                  </span>
                </LensIcon>
                {/* The rings need room: the clip box is padded, and opens to the padded width. */}
                <div className="h-8 w-0 overflow-hidden transition-[width] duration-300 ease-[var(--ease-out)] group-focus-within/hl:w-[94px] group-hover/hl:w-[94px]">
                  <div className="flex h-full w-[94px] items-center gap-2 px-2">
                  {MARKERS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      aria-label={`Highlight in ${m.label.toLowerCase()}`}
                      onClick={() => highlight(m.key)}
                      {...tipProps(m.label)}
                      className={`lens-dot ${m.key === marker ? "is-on" : ""}`}
                      style={{ background: m.color }}
                    />
                  ))}
                  </div>
                </div>
              </div>
            )}
            <LensIcon label="Copy quote" tip={tipProps(copied ? "Copied" : "Copy quote", copied ? undefined : "With its source")} onClick={copy}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </LensIcon>
          </div>
        ) : (
          <form
            className="lens-morph w-[min(500px,calc(100vw-24px))]"
            onSubmit={(e) => {
              e.preventDefault();
              const q = draft.trim();
              if (q) run("ask", q);
            }}
          >
            <div className="flex items-center gap-1.5 pl-3">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    close();
                  }
                }}
                placeholder={short ? "Ask about this word" : "Ask about this passage"}
                aria-label="Your question about the selected passage"
                className="h-8 min-w-0 flex-1 bg-transparent text-[14px] text-lens-fg outline-none focus-visible:outline-none placeholder:text-lens-mute"
              />
              <ModelSwitch tone="lens" />
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label="Ask"
                data-tip="Ask"
                data-tip-kbd={"\u21b5"}
                className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-[var(--rubric)] text-white transition-[opacity,transform] active:scale-90 disabled:opacity-30"
              >
                <ArrowUp size={16} strokeWidth={2.4} />
              </button>
            </div>
            {!draft && (
              <div className="mt-1 flex flex-wrap gap-1 border-t border-lens-mute/15 px-1 pb-0.5 pt-1.5">
                {starters.map((q, i) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => run("ask", q)}
                    className="lens-starter"
                    style={{ animationDelay: `${60 + i * 40}ms` }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </form>
        )}
        {pos && (
          <span
            aria-hidden
            className="absolute size-2.5 rotate-45 bg-lens"
            style={{ left: pos.arrow - 5, ...(pos.below ? { top: -4 } : { bottom: -4 }) }}
          />
        )}

        {menu && lens.mode === "actions" && (
          <div role="menu" aria-label="More actions" className={`lens-menu absolute right-0 ${outside} w-[264px] rounded-[14px] bg-lens p-1 text-lens-fg shadow-pop ring-1 ring-black/5`}>
            {more.map((a, i) => {
              const Icon = ICONS[a]!;
              return (
                <button
                  key={a}
                  type="button"
                  role="menuitem"
                  onClick={() => run(a)}
                  className="lens-item group flex w-full items-start gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-lens-hover"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <Icon size={16} strokeWidth={1.9} className="mt-[1px] shrink-0 text-lens-mute transition-colors group-hover:text-[var(--rubric)]" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium leading-tight">{ACTIONS[a].label}</span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-lens-mute">{ACTIONS[a].hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

function LensIcon({
  label,
  onClick,
  tip,
  children,
}: {
  label: string;
  onClick: () => void;
  tip?: Record<string, string | undefined>;
  children: React.ReactNode;
}) {
  return (
    <button type="button" aria-label={label} onClick={onClick} {...tip} className="lens-btn w-8 justify-center text-lens-fg/85 hover:text-lens-fg">
      {children}
    </button>
  );
}
