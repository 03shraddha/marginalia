"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, Check } from "lucide-react";
import { tidyTitle } from "@/lib/article";
import { useLibraryPrefs } from "@/lib/library-prefs";
import { SAMPLES } from "@/lib/samples";
import { useStore } from "@/lib/store";

export type Saved = { id: string; title: string };

/**
 * One quiet line under the link bar, where the shelf used to be: what you
 * just saved, or what you were in the middle of, and the way to the library.
 */
export function LibraryLine({ saved }: { saved: Saved | null }) {
  const hydrated = useStore((s) => s.hydrated);
  const library = useStore((s) => s.library);
  const progress = useStore((s) => s.progress);
  const { hiddenSamples } = useLibraryPrefs();
  const samples = SAMPLES.filter((a) => !hiddenSamples.includes(a.id));

  const reading = useMemo(() => {
    const titles = new Map(library.map((x) => [x.id, x.title]));
    const cur = Object.entries(progress)
      .filter(([id, p]) => titles.has(id) && p.pct > 0 && p.pct < 1)
      .sort((a, b) => b[1].at - a[1].at)[0];
    return cur ? { id: cur[0], title: tidyTitle(titles.get(cur[0])!), pct: cur[1].pct } : null;
  }, [library, progress]);

  if (!hydrated) return <div className="h-[46px]" aria-hidden />;

  if (saved)
    return (
      <p className="lib-line" key={saved.id}>
        <Check size={14} className="shrink-0 text-good" />
        <span className="min-w-0 truncate">
          Saved <span className="text-ink">{tidyTitle(saved.title)}</span> to your library
        </span>
        <Link href="/library" className="lib-line-go">
          Open <ArrowRight size={13} />
        </Link>
      </p>
    );

  // Nothing of your own yet: the bundled samples, one click from reading.
  if (!library.length && samples.length)
    return (
      <p className="lib-line">
        <span>No link handy? Try</span>
        {samples.map((a, i) => (
          <span key={a.id} className="inline-flex items-center gap-2.5">
            {i > 0 && <span className="text-ink-4">·</span>}
            <Link href={`/read/${a.id}`} className="text-ink-2 underline decoration-rule-strong underline-offset-4 transition-colors hover:text-ink">
              {a.author?.split(" ").slice(-1)[0]}
            </Link>
          </span>
        ))}
      </p>
    );

  return (
    <p className="lib-line">
      {reading ? (
        <Link href={`/read/${reading.id}`} className="min-w-0 truncate transition-colors hover:text-ink">
          Continue <span className="text-ink">{reading.title}</span> <span className="tabular-nums text-ink-4">{Math.round(reading.pct * 100)}%</span>
        </Link>
      ) : (
        <span>
          {library.length} {library.length === 1 ? "text" : "texts"} on your shelves
        </span>
      )}
      <Link href="/library" className="lib-line-go">
        Your library <ArrowRight size={13} />
      </Link>
    </p>
  );
}
