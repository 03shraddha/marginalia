"use client";

import { Globe } from "lucide-react";
import { useStore } from "@/lib/store";

/** Whether answers may look things up on the web. On by default; the model decides when. Fact-check always searches. */
export function WebSwitch({ tone = "plain" }: { tone?: "plain" | "lens" }) {
  const on = useStore((s) => s.settings.search);
  const setSettings = useStore((s) => s.setSettings);
  const lens = tone === "lens";
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label="Search the web"
      data-tip={on ? "Can look things up on the web" : "Answers from the text only"}
      data-tip-hint={on ? "When a question needs it, cited as [1], [2]" : "Turn on to let answers search the web"}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => setSettings({ search: !on })}
      className={`flex h-7 shrink-0 items-center gap-1 rounded-[8px] px-2 text-[11.5px] font-medium transition-colors ${
        on ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-accent" : lens ? "text-lens-mute hover:bg-lens-hover hover:text-lens-fg" : "text-ink-3 hover:bg-fill hover:text-ink"
      }`}
    >
      <Globe size={13} strokeWidth={2} aria-hidden />
      Web
    </button>
  );
}
