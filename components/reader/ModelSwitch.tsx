"use client";

import { Globe } from "lucide-react";
import { MODELS, type ModelKey } from "@/lib/models";
import { useStore } from "@/lib/store";

/** Quick or Deep, everywhere a question is asked. The choice is remembered. */
export function ModelSwitch({ tone = "plain" }: { tone?: "plain" | "lens" }) {
  const model = useStore((s) => s.settings.model);
  const setSettings = useStore((s) => s.setSettings);
  const keys = Object.keys(MODELS) as ModelKey[];
  const lens = tone === "lens";
  return (
    <div
      role="radiogroup"
      aria-label="Model"
      className={`flex shrink-0 items-center rounded-[8px] p-0.5 text-[11.5px] font-medium ${lens ? "bg-lens-hover/70" : "bg-sunk"}`}
    >
      {keys.map((k) => {
        const on = model === k;
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={on}
            data-tip={MODELS[k].label}
            data-tip-hint={k === "flash" ? "Fast, for most questions" : "Slower, more careful"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setSettings({ model: k })}
            className={`h-6 rounded-[6px] px-2 transition-colors ${
              on ? (lens ? "bg-lens-fg text-lens" : "bg-pill text-ink shadow-[0_1px_2px_rgb(0_0_0/0.1)]") : lens ? "text-lens-mute hover:text-lens-fg" : "text-ink-3 hover:text-ink"
            }`}
          >
            {MODELS[k].short}
          </button>
        );
      })}
    </div>
  );
}

/** Look it up on the web too. Remembered, like the model; Fact-check searches either way. */
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
