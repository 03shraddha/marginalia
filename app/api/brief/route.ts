import { BRIEF_TASK, systemFor, type DocPayload } from "@/lib/prompts";
import { completeJSON, DEFAULT_MODEL, isModelKey } from "@/lib/together";
import { undash, type BriefData } from "@/lib/article";
import { allow, clientId } from "@/lib/ratelimit";

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
  if (!apiKey && !process.env.TOGETHER_API_KEY) {
    return Response.json({ mode: "demo", error: "Add a Together API key to generate a brief." }, { status: 200 });
  }

  if (!apiKey && !allow(`brief:${clientId(req)}`, 20, 60 * 60 * 1000)) {
    return Response.json({ error: "The shared key has made a lot of briefs for you this hour. Add your own Together key to keep going." }, { status: 429 });
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
  return Response.json({ mode: "live", brief, usage: result.usage, model });
}
