"use client";

import Link from "next/link";
import { useMemo } from "react";
import { tidyTitle } from "@/lib/article";
import { SAMPLES } from "@/lib/samples";
import { useStore } from "@/lib/store";
import { DailyHighlight } from "./DailyHighlight";

const SHOWN = 12;
const when = (t: number) => {
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/**
 * The right-hand column for a signed-in reader: today's review on top, then
 * the lines you marked most recently, each a link back to its place.
 */
export function YourHighlights() {
  const hydrated = useStore((s) => s.hydrated);
  const highlights = useStore((s) => s.highlights);
  const library = useStore((s) => s.library);
  const setUI = useStore((s) => s.setUI);

  const titleOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of SAMPLES) m.set(a.id, a.title);
    for (const x of library) m.set(x.id, x.title);
    return m;
  }, [library]);

  const all = useMemo(
    () =>
      Object.values(highlights)
        .flat()
        .filter((h) => titleOf.has(h.articleId))
        .sort((a, b) => b.createdAt - a.createdAt),
    [highlights, titleOf]
  );

  if (!hydrated) return null;

  return (
    // On wide screens the column ends above the shelf at the bottom edge, and the list scrolls inside it.
    <aside
      aria-label="Your highlights"
      className="lg:flex lg:max-h-[calc(100dvh-var(--topbar-h)-220px)] lg:flex-col lg:pt-3"
      style={{ animation: "rise 0.5s 0.15s var(--ease-out) both" }}
    >
      <div className="flex shrink-0 items-baseline justify-between gap-4 border-b border-rule pb-3">
        <h2 className="font-serif text-[22px] font-[420] leading-none tracking-[-0.012em] text-ink [font-variation-settings:'opsz'_36]">Your highlights</h2>
        {all.length > 0 && (
          <button
            type="button"
            onClick={() => setUI({ shelf: "highlights" })}
            className="shrink-0 text-[13px] text-ink-3 underline decoration-rule-strong underline-offset-4 transition-colors hover:text-ink"
          >
            {`All ${all.length}`}
          </button>
        )}
      </div>

      {all.length === 0 ? (
        <div className="pt-4 text-[14px] leading-[1.6] text-ink-3">
          <p className="text-ink-2">The lines you mark will gather here.</p>
          <p className="mt-1.5">Open anything on your shelf, select a line, and choose Highlight. A few come back each day to review.</p>
        </div>
      ) : (
        <>
          <div className="shrink-0">
            <DailyHighlight compact />
          </div>
          <ol className="no-scrollbar mt-2 pb-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:[mask-image:linear-gradient(to_bottom,black_calc(100%-48px),transparent)]">
            {all.slice(0, SHOWN).map((h) => (
              <li key={h.id} className="border-b border-rule last:border-b-0">
                <Link href={`/read/${h.articleId}?hl=${h.id}`} className="group block py-3.5">
                  <p className="line-clamp-3 font-serif text-[16px] leading-[1.5] text-ink [font-variation-settings:'opsz'_20]">
                    <span className="m-hl" data-c={h.color && h.color !== "yellow" ? h.color : undefined}>
                      {h.anchor.quote.trim()}
                    </span>
                  </p>
                  {h.note && <p className="mt-1.5 line-clamp-2 whitespace-pre-line text-[13.5px] leading-[1.5] text-ink-2">{h.note}</p>}
                  <p className="mt-1.5 flex items-baseline gap-2 text-[12.5px] text-ink-3">
                    <span className="min-w-0 truncate transition-colors group-hover:text-ink">{tidyTitle(titleOf.get(h.articleId)!)}</span>
                    <span className="shrink-0 text-ink-4">{when(h.createdAt)}</span>
                  </p>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
    </aside>
  );
}
