"use client";

import { useEffect, useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { fetchBrief } from "@/lib/ask";
import { MODELS } from "@/lib/models";
import { useStore } from "@/lib/store";
import { Answer } from "./Answer";
import { fmtCost, useReader } from "./context";

/**
 * The brief: a two-sentence gist, the load-bearing claims with citations, and
 * a map of the text's movements. The map also labels the rail and the top bar.
 */
export function Brief() {
  const { ix, jumpTo } = useReader();
  const brief = useStore((s) => s.briefs[ix.article.id]);
  const open = useStore((s) => s.briefOpen);
  const setUI = useStore((s) => s.setUI);
  const hydrated = useStore((s) => s.hydrated);

  if (!hydrated) return <div className="h-[58px]" />;

  if (!brief) {
    return (
      <div className="mt-9 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-rule py-3.5">
        <button
          type="button"
          onClick={() => fetchBrief(ix)}
          className="group inline-flex h-9 items-center gap-2 rounded-full bg-ink pl-4 pr-3.5 text-[13.5px] font-medium text-bg transition-transform active:scale-[0.98]"
        >
          Brief me
          <kbd className="!border-transparent !bg-bg/15 !text-bg/80">B</kbd>
        </button>
        <p className="text-[13.5px] leading-snug text-ink-3">The gist, the key claims, and a map of the text before you start.</p>
      </div>
    );
  }

  if (brief.status === "loading") return <BriefLoading words={ix.words} />;

  if (brief.status === "error") {
    return (
      <div className="mt-9 flex flex-wrap items-center gap-3 border-y border-rule py-3.5 text-[13.5px]">
        <p className="text-rubric-text">{brief.error}</p>
        {!brief.demo && (
          <button type="button" onClick={() => fetchBrief(ix)} className="font-medium text-ink underline decoration-rule-strong underline-offset-4">
            Try again
          </button>
        )}
      </div>
    );
  }

  const { data, usage, modelKey } = brief;
  return (
    <section aria-label="Brief" className="mt-9 border-y border-rule">
      <button
        type="button"
        onClick={() => setUI({ briefOpen: !open })}
        aria-expanded={open}
        className="flex w-full items-center gap-2 py-3.5 text-left text-[12.5px] font-medium text-rubric-text"
      >
        Brief
        <span className="font-normal text-ink-4">{data.sections.length} parts, {data.claims.length} claims</span>
        <ChevronDown size={15} className={`ml-auto text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="rise pb-6" style={{ animationDuration: "0.45s" }}>
          <div className="gloss-body !text-[16px] !leading-[1.6] text-pretty">
            <Answer text={data.gist} />
          </div>

          {data.claims.length > 0 && (
            <>
              <h3 className="mb-2.5 mt-6 text-[12.5px] font-medium text-ink-3">Key claims</h3>
              <ol className="space-y-2.5">
                {data.claims.map((c, i) => (
                  <li key={i} className="rise grid grid-cols-[1.4rem_minmax(0,1fr)] text-[14.5px] leading-[1.5] text-ink" style={{ animationDuration: "0.5s", animationDelay: `${120 + i * 60}ms` }}>
                    <span className="font-serif text-[14px] leading-[1.55] tabular-nums text-ink-4">{i + 1}</span>
                    <span className="gloss-body !text-[14.5px]">
                      <Answer text={c.cite ? `${c.text} [¶${c.cite}]` : c.text} />
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {data.sections.length > 0 && (
            <>
              <h3 className="mb-2 mt-6 text-[12.5px] font-medium text-ink-3">Map</h3>
              <ol className="grid gap-x-6 sm:grid-cols-2">
                {data.sections.map((s, i) => {
                  const next = data.sections[i + 1]?.start;
                  const end = next ? next - 1 : ix.byNumber.size;
                  return (
                    <li key={i} className="rise" style={{ animationDuration: "0.45s", animationDelay: `${260 + i * 40}ms` }}>
                      <button
                        type="button"
                        onClick={() => jumpTo(s.start)}
                        className="group flex w-full items-baseline gap-3 border-b border-rule py-2 text-left text-[14px] text-ink transition-colors hover:text-rubric-text"
                      >
                        <span className="w-4 shrink-0 font-serif text-[14px] tabular-nums text-ink-4">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate">{s.title}</span>
                        <span className="shrink-0 text-[12px] tabular-nums text-ink-4 group-hover:text-rubric-text">
                          ¶{s.start}
                          {end > s.start ? `-${end}` : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </>
          )}

          <div className="mt-5 flex items-center gap-3 text-[11.5px] tabular-nums text-ink-4">
            <span>
              {modelKey ? MODELS[modelKey].label : ""}
              {usage ? ` / ${usage.promptTokens.toLocaleString()} in, ${usage.completionTokens} out / ${fmtCost(usage.costUsd)}` : ""}
            </span>
            <button type="button" onClick={() => fetchBrief(ix)} className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-sunk hover:text-ink">
              <RotateCcw size={11} /> Redo
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** The brief takes a few seconds: say what is happening, and sketch the shape that is coming. */
function BriefLoading({ words }: { words: number }) {
  const steps = [`Reading all ${words.toLocaleString()} words`, "Weighing the key claims", "Mapping the sections"];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((i) => Math.min(i + 1, steps.length - 1)), 2600);
    return () => clearInterval(t);
  }, [steps.length]);
  return (
    <section aria-busy aria-live="polite" className="mt-9 border-y border-rule py-5">
      <div className="mb-5 flex items-center gap-3">
        <p key={step} className="text-[12.5px] font-medium text-rubric-text" style={{ animation: "rise 0.4s var(--ease-out) both" }}>
          {steps[step]}
        </p>
        <div className="loading-bar ml-auto w-24" aria-hidden />
      </div>
      <div className="space-y-2.5" aria-hidden>
        <div className="shimmer h-3.5 w-[94%]" />
        <div className="shimmer h-3.5 w-[86%]" />
        <div className="shimmer h-3.5 w-[52%]" />
      </div>
      <div className="mt-6 space-y-2.5" aria-hidden>
        {[78, 64, 70].map((w, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="shimmer h-3 w-3 rounded-full" style={{ animationDelay: `${i * 0.1}s` }} />
            <div className="shimmer h-3" style={{ width: `${w}%`, animationDelay: `${i * 0.1}s` }} />
          </div>
        ))}
      </div>
    </section>
  );
}
