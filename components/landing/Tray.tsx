"use client";

import Link from "next/link";
import { useRef } from "react";
import { Plus, X } from "lucide-react";
import { readingMinutes, tidyTitle } from "@/lib/article";

export type TrayItem = {
  id: string;
  title: string;
  byline: string;
  dek?: string;
  words: number;
  pct: number;
  glosses: number;
  sample: boolean;
};

/**
 * The shelf, as papers at the bottom edge of the desk. Each one shows just
 * its title until you reach for it; then it rises with the rest.
 */
export function Tray({ items, onOpen, onRemove, onAdd }: { items: TrayItem[]; onOpen: (id: string) => void; onRemove: (id: string) => void; onAdd: () => void }) {
  const scroller = useRef<HTMLDivElement>(null);

  return (
    <div className="tray" aria-label="Your shelf">
      <div
        ref={scroller}
        className="tray-scroll no-scrollbar"
        onWheel={(e) => {
          const el = scroller.current;
          if (el && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
        }}
      >
        {items.map((it, i) => (
          <div key={it.id} className="tray-slot" style={{ ["--tilt" as string]: `${[-0.6, 0.45, -0.25, 0.55, -0.4][i % 5]}deg` }}>
            <Link
              href={`/read/${it.id}`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey) return;
                e.preventDefault();
                onOpen(it.id);
              }}
              className="tray-card group"
              aria-label={`${tidyTitle(it.title)}${it.pct > 0 ? `, ${Math.round(it.pct * 100)} percent read` : ""}`}
            >
              {it.pct > 0 && it.pct < 1 && <span className="tray-ribbon" aria-hidden />}
              <p className={`flex items-baseline justify-between gap-3 text-[12px] text-ink-3 ${it.pct > 0 && it.pct < 1 ? "pr-7" : ""}`}>
                <span className="truncate">{it.byline}</span>
                <span className="shrink-0 tabular-nums text-ink-4">{it.pct > 0 && it.pct < 1 ? `${Math.round(it.pct * 100)}%` : `${readingMinutes(it.words)} min`}</span>
              </p>
              <p className="mt-1.5 line-clamp-2 font-serif text-[20px] leading-[1.15] tracking-[-0.01em] text-ink">{tidyTitle(it.title)}</p>
              {it.dek && <p className="mt-3 line-clamp-3 font-serif text-[14px] italic leading-[1.45] text-ink-2">{it.dek}</p>}
              <div className="mt-auto flex items-center gap-3 pt-3 text-[12px] text-ink-3">
                <span className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-rule" aria-hidden>
                  <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--rubric)]" style={{ width: `${Math.round(it.pct * 100)}%` }} />
                </span>
                <span className="shrink-0">{it.pct >= 1 ? "Finished" : it.pct > 0 ? "Continue" : "Start"}</span>
                {it.glosses > 0 && (
                  <span className="shrink-0 text-rubric-text">
                    {it.glosses} note{it.glosses === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </Link>
            {!it.sample && (
              <button type="button" aria-label={`Remove ${it.title} from your shelf`} onClick={() => onRemove(it.id)} className="tray-remove">
                <X size={13} />
              </button>
            )}
          </div>
        ))}
        <div className="tray-slot" style={{ ["--tilt" as string]: "0.3deg" }}>
          <button type="button" onClick={onAdd} className="tray-card tray-add">
            <span className="flex items-center gap-2 text-[13.5px] font-medium text-ink-2">
              <Plus size={16} /> Add to your shelf
            </span>
            <span className="mt-1.5 text-[12.5px] text-ink-3">A PDF, a .txt or .md file. Or drop one anywhere.</span>
          </button>
        </div>
      </div>
    </div>
  );
}
