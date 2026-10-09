/**
 * The model allow-list and wire types. Safe to import on the client: no keys,
 * no fetches. lib/together.ts does the network side.
 */

export type ModelEntry = {
  id: string;
  label: string;
  short: string;
  blurb: string;
  inPerM: number;
  cachedPerM: number;
  outPerM: number;
};

/**
 * The allow-list. Route and UI both read it. Verified live 2026-10-08:
 * DeepSeek V4.1 Flash ~0.5s to first token; V4 Pro ~0.8 to 2s.
 * Left out on purpose: Qwen3.8 (prints its reasoning into content with thinking
 * off), Kimi K3 (50s cold first token), GLM-5.3 (ignores enable_thinking:false).
 */
export const MODELS = {
  flash: {
    id: "deepseek-ai/DeepSeek-V4.1-Flash",
    label: "DeepSeek V4.1 Flash",
    short: "Quick",
    blurb: "Answers in about half a second. Best for most questions.",
    inPerM: 0.3,
    cachedPerM: 0.006,
    outPerM: 1.2,
  },
  pro: {
    id: "deepseek-ai/DeepSeek-V4-Pro-0813",
    label: "DeepSeek V4 Pro",
    short: "Deep",
    blurb: "Slower, more careful. For arguments, critique and synthesis.",
    inPerM: 1.32,
    cachedPerM: 0.13,
    outPerM: 3.96,
  },
} as const satisfies Record<string, ModelEntry>;

export type ModelKey = keyof typeof MODELS;
export const DEFAULT_MODEL: ModelKey = "flash";

export function isModelKey(v: unknown): v is ModelKey {
  return typeof v === "string" && v in MODELS;
}

export type Usage = {
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  costUsd: number;
};

/** Dollars for a run. Cached prompt tokens bill at the cached rate. */
export function costFor(key: ModelKey, prompt: number, cached: number, completion: number): number {
  const m: ModelEntry = MODELS[key];
  const fresh = Math.max(0, prompt - cached);
  return (fresh * m.inPerM + cached * m.cachedPerM + completion * m.outPerM) / 1_000_000;
}

export type StreamEvent =
  | { type: "meta"; mode: "live" | "demo"; model: string }
  | { type: "content"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "done" }
  | { type: "error"; text: string };
