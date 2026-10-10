import { BRIEF_TASK, systemFor, type DocPayload } from "@/lib/prompts";
import { completeJSON, DEFAULT_MODEL, isModelKey } from "@/lib/together";
import { undash, type BriefData } from "@/lib/article";
import { chargeFree, checkFree, estimateUsd, needKey } from "@/lib/quota";
import { MODELS } from "@/lib/models";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: { apiKey?: string; model?: string; doc?: DocPayload };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const doc = body.doc;
  if (!doc?.title || !Array.isArray(doc.paras) || doc.paras.length === 0) {
    return Response.json({ error: "doc is required." }, { status: 400 });
  }

  const apiKey = body.apiKey?.trim() || undefined;
  // A gloss of the whole text spends from the same free allowance.
  let free: Awaited<ReturnType<typeof checkFree>> | null = null;
  if (!apiKey) {
    if (!process.env.TOGETHER_API_KEY) return needKey(null);
    free = await checkFree(req);
    if (!free.ok) return needKey(free);
  }

  const model = isModelKey(body.model) ? body.model : DEFAULT_MODEL;
  const result = await completeJSON<BriefData>({
    model,
    apiKey,
    signal: req.signal,
    messages: [
      { role: "system", content: systemFor(doc) },
      { role: "user", content: BRIEF_TASK },
    ],
  });
  if (free) {
    const chars = doc.paras.reduce((a, p) => a + (p.text?.length ?? 0), 0);
    await chargeFree(free.subject, result.ok ? result.usage.costUsd : estimateUsd(chars, MODELS[model].inPerM));
  }
  if (!result.ok) return Response.json({ error: result.error }, { status: 502 });

  // Keep only well-formed, in-range items so the UI never links to nothing.
  const valid = new Set(doc.paras.map((p) => p.n));
  const d = result.data;
  // The shared system prompt asks glosses to ==mark== their answer; a brief has no use for it.
  const clean = (t: string) => undash(t).replace(/==/g, "");
  const brief: BriefData = {
    gist: clean(String(d.gist ?? "")),
    claims: (Array.isArray(d.claims) ? d.claims : [])
      .filter((c) => c && typeof c.text === "string")
      .map((c) => ({ text: clean(c.text), cite: valid.has(Number(c.cite)) ? Number(c.cite) : 0 }))
      .slice(0, 6),
    sections: (Array.isArray(d.sections) ? d.sections : [])
      .filter((s) => s && typeof s.title === "string" && valid.has(Number(s.start)))
      .map((s) => ({ title: clean(s.title), start: Number(s.start) }))
      .sort((a, b) => a.start - b.start)
      .slice(0, 10),
  };
  return Response.json({ brief, usage: result.usage, model }, { headers: free ? { "X-Free-Left": free.left.toFixed(3) } : undefined });
}
