"use client";

import { Globe } from "lucide-react";
import { useStore } from "@/lib/store";

/** Look it up on the web too. Remembered; Fact-check searches either way. */
export function WebSwitch({ tone = "plain" }: { tone?: "plain" | "lens" }) {
  const on = useStore((s) => s.settings.web);
  const setSettings = useStore((s) => s.setSettings);
  const lens = tone === "lens";
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label="Search the web"
      data-tip={on ? "Searching the web" : "Search the web"}
      data-tip-hint="Adds web results, cited as [1], [2]"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => setSettings({ web: !on })}
      className={`flex h-7 shrink-0 items-center gap-1 rounded-[8px] px-2 text-[11.5px] font-medium transition-colors ${
        on ? (lens ? "bg-lens-fg text-lens" : "bg-pill text-ink shadow-[0_1px_2px_rgb(0_0_0/0.1)] ring-1 ring-rule") : lens ? "text-lens-mute hover:text-lens-fg" : "text-ink-3 hover:bg-sunk hover:text-ink"
      }`}
    >
      <Globe size={13} strokeWidth={2} aria-hidden />
      Web
    </button>
  );
}
