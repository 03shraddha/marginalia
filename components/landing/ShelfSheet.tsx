"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Search, X } from "lucide-react";
import { readingMinutes, tidyTitle } from "@/lib/article";
import type { TrayItem } from "./Tray";

type Filter = "all" | "reading" | "unread" | "done";

const FILTERS: { key: Filter; label: string; test: (it: TrayItem) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "reading", label: "Reading", test: (it) => it.pct > 0 && it.pct < 1 },
  { key: "unread", label: "Not started", test: (it) => it.pct === 0 },
  { key: "done", label: "Finished", test: (it) => it.pct >= 1 },
];

/** How far along, as a ring: empty, a pen-coloured arc, or closed with a tick. */
function Ring({ pct }: { pct: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  if (pct >= 1)
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--rubric)] text-bg" aria-hidden>
        <Check size={13} strokeWidth={2.6} />
      </span>
    );
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0 -rotate-90" aria-hidden>
      <circle cx="12" cy="12" r={r} fill="none" stroke="var(--rule-strong)" strokeWidth="2" />
      {pct > 0 && <circle cx="12" cy="12" r={r} fill="none" stroke="var(--rubric)" strokeWidth="2" strokeLinecap="round" strokeDasharray={`${Math.max(0.06, pct) * c} ${c}`} />}
    </svg>
  );
}

/**
 * The whole shelf, pulled up over the desk: every text, newest reading first,
 * found by typing. Arrow keys walk the list; S opens it from the desk.
 */
export function ShelfSheet({
  open,
  items,
  onOpenChange,
  onOpen,
  onRemove,
}: {
  open: boolean;
  items: TrayItem[];
  onOpenChange: (v: boolean) => void;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // S opens the shelf from the desk.
  useEffect(() => {
    if (open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest?.("input, textarea, [contenteditable]")) return;
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setFilter("all");
    // Ready to type with a keyboard; on a phone, no keyboard leaping over the list.
    if (window.matchMedia("(pointer: fine)").matches) requestAnimationFrame(() => inputRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const rows = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-row]") ?? [])];
      if (!rows.length) return;
      e.preventDefault();
      const i = rows.indexOf(document.activeElement as HTMLElement);
      const next = e.key === "ArrowDown" ? (i < 0 ? 0 : Math.min(rows.length - 1, i + 1)) : i <= 0 ? -1 : i - 1;
      if (next < 0) inputRef.current?.focus();
      else rows[next].focus();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onOpenChange]);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, items.filter(f.test).length])) as Record<Filter, number>, [items]);
  const shown = useMemo(() => {
    const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const test = FILTERS.find((f) => f.key === filter)!.test;
    return items.filter((it) => test(it) && words.every((w) => `${it.title} ${it.byline}`.toLowerCase().includes(w)));
  }, [items, q, filter]);

  if (!open) return null;

  // Portalled: the desk's tray is its own stacking layer and ignores the pointer.
  return createPortal(
    <div className="fixed inset-0 z-[80]" role="presentation">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" style={{ animation: "fade 0.25s both" }} onClick={() => onOpenChange(false)} />
      <section role="dialog" aria-modal aria-label="Your shelf" className="shelf-sheet">
        <div className="mx-auto flex h-full w-full max-w-[1040px] flex-col px-5 sm:px-10">
          <header className="flex flex-wrap items-center gap-x-6 gap-y-4 pb-5 pt-7">
            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-[30px] leading-none tracking-[-0.015em] text-ink">Your shelf</h2>
              <p className="mt-2 text-[13px] text-ink-3">
                {items.length} texts{counts.reading ? ` · ${counts.reading} in progress` : ""}
              </p>
            </div>
            <label className="flex h-10 w-full items-center gap-2 rounded-full border border-rule bg-bg px-3.5 transition-colors focus-within:border-rule-strong sm:w-[300px]">
              <Search size={15} className="shrink-0 text-ink-4" aria-hidden />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find a title or author"
                aria-label="Find a title or author"
                className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-4 focus-visible:outline-none"
              />
            </label>
            <button
              type="button"
              aria-label="Close"
              data-tip="Close"
              data-tip-kbd="Esc"
              onClick={() => onOpenChange(false)}
              className="-mr-2 grid size-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-sunk hover:text-ink max-sm:absolute max-sm:right-5 max-sm:top-6"
            >
              <X size={17} />
            </button>
          </header>

          <div role="radiogroup" aria-label="Show" className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto border-b border-rule px-1 pb-3">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="radio"
                aria-checked={filter === f.key}
                onClick={() => setFilter(f.key)}
                disabled={f.key !== "all" && !counts[f.key]}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors disabled:opacity-35 ${
                  filter === f.key ? "bg-ink text-bg" : "text-ink-3 hover:bg-sunk hover:text-ink"
                }`}
              >
                {f.label}
                <span className={`tabular-nums ${filter === f.key ? "text-bg/60" : "text-ink-4"}`}>{counts[f.key]}</span>
              </button>
            ))}
          </div>

          <ul ref={listRef} className="scroll-thin -mx-3 grid flex-1 content-start gap-x-6 overflow-y-auto px-3 pb-10 pt-2 md:grid-cols-2">
            {shown.map((it, i) => (
              <li key={it.id} className="shelf-row group relative" style={{ animationDelay: `${Math.min(i, 14) * 18}ms` }}>
                <Link
                  href={`/read/${it.id}`}
                  data-row
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey) return;
                    e.preventDefault();
                    onOpenChange(false);
                    onOpen(it.id);
                  }}
                  className="flex items-start gap-3.5 rounded-[12px] px-3 py-3 pr-10 transition-colors hover:bg-sunk/70 focus-visible:bg-sunk/70 focus-visible:outline-offset-[-2px]"
                >
                  <span className="mt-0.5">
                    <Ring pct={it.pct} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 font-serif text-[18px] leading-[1.2] tracking-[-0.01em] text-ink">{tidyTitle(it.title)}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-ink-3">
                      <span className="max-w-[60%] truncate">{it.byline}</span>
                      <span aria-hidden className="text-ink-4">{"·"}</span>
                      <span className="tabular-nums">{it.pct > 0 && it.pct < 1 ? `${Math.round(it.pct * 100)}% read` : `${readingMinutes(it.words)} min`}</span>
                      {it.glosses > 0 && (
                        <>
                          <span aria-hidden className="text-ink-4">{"·"}</span>
                          <span className="text-rubric-text">
                            {it.glosses} note{it.glosses === 1 ? "" : "s"}
                          </span>
                        </>
                      )}
                    </span>
                  </span>
                </Link>
                {!it.sample && (
                  <button
                    type="button"
                    aria-label={`Remove ${it.title} from your shelf`}
                    data-tip="Remove from shelf"
                    onClick={() => onRemove(it.id)}
                    className="absolute right-2 top-3 grid size-7 place-items-center rounded-full text-ink-4 opacity-0 transition-[opacity,background-color] hover:bg-bg hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <X size={14} />
                  </button>
                )}
              </li>
            ))}
            {!shown.length && (
              <li className="col-span-full py-16 text-center text-[14px] text-ink-3">
                {q ? <>Nothing on your shelf matches &ldquo;{q}&rdquo;.</> : "Nothing here yet."}
              </li>
            )}
          </ul>
        </div>
      </section>
    </div>,
    document.body
  );
}
