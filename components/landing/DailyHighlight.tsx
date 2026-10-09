"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { tidyTitle } from "@/lib/article";
import { DAILY, keepInRotation, retire, todaysReview } from "@/lib/review";
import { SAMPLES } from "@/lib/samples";
import { useStore } from "@/lib/store";

/**
 * A few of your own highlights back on the desk each day, one at a time.
 * Keep one and it returns in a few days, then less and less often; mark it
 * done and it leaves the review. Nothing at all until you have highlights.
 */
export function DailyHighlight() {
  const hydrated = useStore((s) => s.hydrated);
  const highlights = useStore((s) => s.highlights);
  const library = useStore((s) => s.library);
  const updateHighlight = useStore((s) => s.updateHighlight);
  const setUI = useStore((s) => s.setUI);

  const titleOf = useMemo(() => {
    const m = new Map<string, { title: string; author?: string }>();
    for (const a of SAMPLES) m.set(a.id, { title: a.title, author: a.author });
    for (const x of library) m.set(x.id, { title: x.title, author: x.author });
    return m;
  }, [library]);

  const all = useMemo(() => Object.values(highlights).flat().filter((h) => titleOf.has(h.articleId)), [highlights, titleOf]);
  const { deck, done } = useMemo(() => todaysReview(all), [all]);

  if (!hydrated || (!deck.length && !done)) return null;

  const pick = deck[0];
  const total = Math.min(DAILY, done + deck.length);
  const src = pick ? titleOf.get(pick.articleId) : undefined;
  const allLink = (
    <button type="button" onClick={() => setUI({ shelf: "highlights" })} className="text-ink-3 underline decoration-rule-strong underline-offset-4 transition-colors hover:text-ink">
      All highlights
    </button>
  );

  return (
    <section aria-label="Today's review" className="mt-8 max-w-[600px] py-1 pl-1 pr-3" style={{ animation: "rise 0.5s 0.35s var(--ease-out) both" }}>
      <p className="flex items-baseline justify-between gap-4 text-[12.5px] font-medium text-ink-3">
        <span>{pick ? "Today, from your highlights" : "Today’s review is done"}</span>
        {pick && total > 1 && <span className="tabular-nums text-ink-4">{`${done + 1} of ${total}`}</span>}
      </p>

      {pick && src ? (
        <div key={pick.id} style={{ animation: "rise 0.45s var(--ease-out) both" }}>
          <Link href={`/read/${pick.articleId}?hl=${pick.id}`} className="group mt-2 block">
            <blockquote className="line-clamp-3 font-serif text-[18px] leading-[1.5] text-ink [font-variation-settings:'opsz'_24]">
              <span className="m-hl" data-c={pick.color && pick.color !== "yellow" ? pick.color : undefined}>
                {pick.anchor.quote.trim()}
              </span>
            </blockquote>
            {pick.note && <p className="mt-2 line-clamp-2 whitespace-pre-line text-[14px] leading-[1.55] text-ink-2">{pick.note}</p>}
            <p className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors group-hover:text-ink">
              <span className="truncate">
                {tidyTitle(src.title)}
                {src.author ? `, ${src.author}` : ""}
              </span>
              <ArrowRight size={14} className="shrink-0 transition-transform duration-300 ease-[var(--ease-out)] group-hover:translate-x-1" aria-hidden />
            </p>
          </Link>
          <div className="mt-3.5 flex items-center gap-1 text-[13px]">
            <button
              type="button"
              onClick={() => updateHighlight(pick.articleId, pick.id, { review: keepInRotation(pick) })}
              data-tip="Keep it coming back"
              data-tip-hint="In a few days, then less often"
              className="-ml-3 h-8 rounded-full px-3 font-medium text-ink-2 transition-colors hover:bg-sunk hover:text-ink"
            >
              Next
            </button>
            <button
              type="button"
              onClick={() => updateHighlight(pick.articleId, pick.id, { review: retire(pick) })}
              data-tip="Done with this one"
              data-tip-hint="It stays a highlight, but leaves the review"
              className="h-8 rounded-full px-3 text-ink-3 transition-colors hover:bg-sunk hover:text-ink"
            >
              Done with it
            </button>
            <span className="ml-auto">{allLink}</span>
          </div>
        </div>
      ) : (
        <p className="mt-2 flex items-center justify-between gap-4 text-[14px] text-ink-2">
          <span>More of your highlights tomorrow.</span>
          <span className="text-[13px]">{allLink}</span>
        </p>
      )}
    </section>
  );
}
