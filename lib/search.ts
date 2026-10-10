/**
 * Web search with Exa, for answers that need the world beyond the text:
 * Fact-check always, and any question asked with Web on. Server-side only.
 *
 * "fast" search, verified 2026-10-09: about 0.7s, $0.007 a search including
 * the excerpts ("auto" took 2.3s for no better results). Excerpts are Exa's
 * query-relevant highlights rather than whole pages, so the prompt stays small.
 */

import type { Source } from "./models";

const EXA_URL = "https://api.exa.ai/search";
/** What a search costs when Exa does not say, charged against a free reader's budget. */
export const SEARCH_USD = 0.007;
const RESULTS = 5;

export const searchEnabled = () => Boolean(process.env.EXA_API_KEY);

export type WebResults = { sources: Source[]; excerpts: string[]; usd: number };

/** Null when search is off, fails or times out: the answer goes ahead without it. */
export async function webSearch(query: string, signal?: AbortSignal): Promise<WebResults | null> {
  const key = process.env.EXA_API_KEY;
  if (!key || !query.trim()) return null;
  try {
    const res = await fetch(EXA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
      body: JSON.stringify({
        query: query.slice(0, 500),
        type: "fast",
        numResults: RESULTS,
        contents: { highlights: { numSentences: 3, highlightsPerUrl: 2 } },
      }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      results?: { title?: string; url?: string; publishedDate?: string; highlights?: string[] }[];
      costDollars?: { total?: number };
    };
    const rows = (j.results ?? []).filter((r) => r.url && /^https?:/i.test(r.url) && r.highlights?.length);
    if (!rows.length) return null;
    const sources: Source[] = rows.map((r, i) => {
      let site = "";
      try {
        site = new URL(r.url!).hostname.replace(/^www\./, "");
      } catch {}
      return { n: i + 1, title: (r.title || site).trim().slice(0, 160), url: r.url!, site, ...(r.publishedDate ? { date: r.publishedDate.slice(0, 10) } : {}) };
    });
    const excerpts = rows.map((r) => r.highlights!.join(" … ").replace(/\s+/g, " ").slice(0, 900));
    return { sources, excerpts, usd: j.costDollars?.total ?? SEARCH_USD };
  } catch {
    return null;
  }
}

/** What to search for: the reader's question, with the passage it is about for context. */
export function searchQuery(t: { action: string; quote?: string; question?: string }, latest?: string): string {
  const quote = t.quote?.replace(/\s+/g, " ").trim().slice(0, 300);
  const question = (latest ?? t.question)?.trim();
  if (t.action === "check" && !latest) return quote ?? question ?? "";
  if (question && quote) return `${question} (about: "${quote}")`;
  return question ?? quote ?? "";
}
