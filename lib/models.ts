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
  /** A model that thinks: sent as reasoning_effort, with room added to max_tokens so the thinking can't eat the answer. */
  reasoning?: { effort: "low"; headroom: number };
};

/**
 * The allow-list. Route and UI both read it. Bake-off 2026-10-09: 3 sample
 * texts x 8 tasks on the real prompts, answers scored blind by a judge.
 *   V4.1 Flash  0.23s to first token, $0.0006 an answer, 7.3/10, best in 11 of 24
 *   V4 Pro      0.58s, $0.0052, 6.5/10
 *   Kimi K3     0.86s, $0.0096, 6.3/10 (best gloss summaries, weak on Related)
 *   GLM-5.3     0.36s at reasoning_effort low, $0.0048, 6.3/10, 3 of the 4 factual errors
 * GLM-5.3 ignores every thinking-off flag (default effort: a 60s summary).
 * Also left out: Qwen3.8 (prints its reasoning into content with thinking off).
 *
 * Deep is Kimi K3 at reasoning_effort low: it thinks 4 to 70 tokens, then
 * answers in 0.5 to 3s warm (one cold start took ~2 minutes). About $0.007 to
 * $0.03 an answer; the $2.70/M input is most of it on long texts.
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
    id: "moonshotai/Kimi-K3",
    label: "Kimi K3",
    short: "Deep",
    blurb: "Slower, more careful. For arguments, critique and synthesis.",
    inPerM: 2.7,
    cachedPerM: 0.27,
    outPerM: 13.5,
    reasoning: { effort: "low", headroom: 1024 },
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
  | { type: "meta"; model: string }
  | { type: "content"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "done" }
  | { type: "error"; text: string };
