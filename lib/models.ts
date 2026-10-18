/**
 * The model allow-list and wire types. Safe to import on the client: no keys,
 * no fetches. lib/llm.ts does the network side.
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
 * The allow-list. Route and UI both read it. Served by Sarvam's v2 chat
 * completions endpoint (beta, whitelisted per key).
 *
 * DeepSeek V4.1 Flash, the same model the Together build used, so the prompts
 * and the 2026-10-09 bake-off still hold. Thinking stays off (see llm.ts):
 * with it on, Flash defaults to "max" effort and spends seconds before a word.
 *
 * Prices are Sarvam's (docs.sarvam.ai pricing, 2026-10-18): ₹25 in, ₹0.5
 * cached, ₹105 out per 1M tokens, converted at ₹88 to the dollar for the
 * free-allowance maths in quota.ts.
 */
const INR = 1 / 88;
export const MODELS = {
  flash: {
    id: "deepseekv4.1-flash",
    label: "DeepSeek V4.1 Flash",
    short: "Quick",
    blurb: "Answers in well under a second. Best for most questions.",
    inPerM: 25 * INR,
    cachedPerM: 0.5 * INR,
    outPerM: 105 * INR,
  },
} as const satisfies Record<string, ModelEntry>;

export type ModelKey = keyof typeof MODELS;
export const DEFAULT_MODEL: ModelKey = "flash";

export function isModelKey(v: unknown): v is ModelKey {
  return typeof v === "string" && v in MODELS;
}

/** A model key that is still on the list: a saved "pro" from before Deep was dropped becomes Flash. */
export const modelOf = (v: unknown): ModelKey => (isModelKey(v) ? v : DEFAULT_MODEL);

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

/** A web result an answer can cite as [n]. */
export type Source = { n: number; title: string; url: string; site: string; date?: string };

export type StreamEvent =
  | { type: "meta"; model: string }
  | { type: "searching" }
  /** The model asked for a tool (web search); the route runs it and asks again. Never sent to the browser. */
  | { type: "tool"; id: string; name: string; args: string }
  /** Drop what was written so far: a line before a tool call ("I'll look that up") that the real answer replaces. */
  | { type: "reset" }
  | { type: "sources"; sources: Source[] }
  | { type: "content"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "done" }
  | { type: "error"; text: string };
