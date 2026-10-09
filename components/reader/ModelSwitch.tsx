"use client";

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
            title={`${MODELS[k].label}. ${MODELS[k].blurb}`}
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
