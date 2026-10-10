"use client";

import Link from "next/link";
import { useMemo } from "react";
import { SignInButton } from "@clerk/nextjs";
import { tidyTitle } from "@/lib/article";
import { SAMPLES } from "@/lib/samples";
import { useStore } from "@/lib/store";
import { todaysReview } from "@/lib/review";
import { DailyHighlight } from "./DailyHighlight";

const RECENT = 3;

const STEPS = [
  { title: "Paste a link", body: "An article, a chapter or a PDF." },
  { title: "Select any line", body: "A word, a sentence, a passage." },
  { title: "Ask it anything", body: "The answer lands in the margin, citing the text." },
];

function SignInLine({ children }: { children: string }) {
  return (
    <p className="mt-7 text-center text-[13px] text-ink-3">
      {children}{" "}
      <SignInButton mode="modal">
        <button type="button" className="font-medium text-ink-2 underline decoration-rule-strong underline-offset-4 transition-colors hover:text-ink">
          Sign in
        </button>
      </SignInButton>
    </p>
  );
}

/**
 * The quiet space under the headline. Once you have highlights, it is yours:
 * today's review and the lines you marked last. Before that, how it works in
 * three steps. Signed out, a line about keeping it all on every device.
 */
export function HomeBelow({ signedIn }: { signedIn: boolean }) {
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

  if (!hydrated) return <div className="h-40" aria-hidden />;

  if (!all.length)
    return (
      <section aria-label="How it works" className="mx-auto mt-16 w-full max-w-[760px] px-6 sm:px-10" style={{ animation: "rise 0.5s 0.2s var(--ease-out) both" }}>
        <ol className="grid gap-6 border-t border-rule pt-7 sm:grid-cols-3 sm:gap-8">
          {STEPS.map((s, i) => (
            <li key={s.title} className="text-left">
              <span className="font-serif text-[15px] tabular-nums text-rubric-text">{i + 1}</span>
              <p className="mt-1 text-[14.5px] font-medium text-ink">{s.title}</p>
              <p className="mt-1 text-[13.5px] leading-[1.5] text-ink-3">{s.body}</p>
            </li>
          ))}
        </ol>
        {!signedIn && <SignInLine>Keep your highlights on every device.</SignInLine>}
      </section>
    );

  // One thing at a time: today's review while a highlight is due, otherwise the lines marked last.
  const due = todaysReview(all).deck.length > 0;
  return (
    <section aria-label="Your highlights" className="mx-auto mt-14 w-full max-w-[680px] px-6 text-left sm:px-10" style={{ animation: "rise 0.5s 0.2s var(--ease-out) both" }}>
      {due ? (
        <DailyHighlight />
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2.5">
            <h2 className="text-[12.5px] font-medium text-ink-3">Your latest highlights</h2>
            <button
              type="button"
              onClick={() => setUI({ shelf: "highlights" })}
              className="shrink-0 text-[13px] text-ink-3 underline decoration-rule-strong underline-offset-4 transition-colors hover:text-ink"
            >
              {`All ${all.length}`}
            </button>
          </div>
          <ol className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-3">
            {all.slice(0, RECENT).map((h) => (
              <li key={h.id}>
                <Link href={`/read/${h.articleId}?hl=${h.id}`} className="group block">
                  <p className="line-clamp-3 font-serif text-[15.5px] leading-[1.5] text-ink [font-variation-settings:'opsz'_20]">
                    <span className="m-hl" data-c={h.color && h.color !== "yellow" ? h.color : undefined}>
                      {h.anchor.quote.trim()}
                    </span>
                  </p>
                  <p className="mt-2 truncate text-[12.5px] text-ink-3 transition-colors group-hover:text-ink">{tidyTitle(titleOf.get(h.articleId)!)}</p>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
      {!signedIn && <SignInLine>These live in this browser only.</SignInLine>}
    </section>
  );
}
