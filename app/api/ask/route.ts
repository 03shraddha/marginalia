import { buildMessages, isLengthKey, webBlock, type DocPayload, type ThreadPayload } from "@/lib/prompts";
import { DEFAULT_MODEL, isModelKey, streamChat, type StreamEvent } from "@/lib/together";
import { ACTIONS } from "@/lib/actions";
import { chargeFree, checkFree, estimateUsd, needKey } from "@/lib/quota";
import { MODELS } from "@/lib/models";
import { allow, clientId } from "@/lib/ratelimit";
import { searchEnabled, searchQuery, webSearch } from "@/lib/search";

export const runtime = "nodejs";
export const maxDuration = 300;

/** About 150k tokens of text. Larger documents are windowed by the client. */
const MAX_DOC_CHARS = 600_000;

type Body = {
  apiKey?: string;
  model?: string;
  length?: string;
  doc?: DocPayload;
  thread?: ThreadPayload;
  history?: { role: "user" | "assistant"; content: string }[];
  /** Search the web for this question. Fact-check always does. */
  web?: boolean;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { doc, thread } = body;
  if (!doc?.title || !Array.isArray(doc.paras) || !thread || !(thread.action in ACTIONS)) {
    return Response.json({ error: "doc and thread are required." }, { status: 400 });
  }
  const docChars = doc.paras.reduce((a, p) => a + (p.text?.length ?? 0), 0);
  if (docChars > MAX_DOC_CHARS) return Response.json({ error: "This text is too long to send in one piece." }, { status: 413 });
  if ((thread.quote?.length ?? 0) > 12_000 || (thread.question?.length ?? 0) > 4_000) {
    return Response.json({ error: "That selection or question is too long." }, { status: 413 });
  }
  const history = (body.history ?? []).slice(-12).filter((m) => m && (m.role === "user" || m.role === "assistant"));

  const model = isModelKey(body.model) ? body.model : DEFAULT_MODEL;
  const headerKey = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  const apiKey = body.apiKey?.trim() || headerKey || undefined;
  // No key of their own: a few cents of answers a day on the shared key, then they bring one.
  let free: Awaited<ReturnType<typeof checkFree>> | null = null;
  if (!apiKey) {
    if (!process.env.TOGETHER_API_KEY) return needKey(null);
    free = await checkFree(req);
    if (!free.ok) return needKey(free);
  }

  // Fact-check always looks things up; other questions when the reader turns Web on. Free readers
  // pay for the search from their daily budget; readers with their own key get a generous daily cap.
  const wantsWeb = searchEnabled() && (thread.action === "check" || body.web === true);
  const webOk = wantsWeb && (free !== null || allow(`search:${clientId(req)}`, 150, 86_400_000));
  const latest = [...history].reverse().find((m) => m.role === "user")?.content;

  const encoder = new TextEncoder();
  const send = (e: StreamEvent) => encoder.encode(`data: ${JSON.stringify(e)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      let web: string | undefined;
      let searchUsd = 0;
      if (webOk) {
        controller.enqueue(send({ type: "searching" }));
        const found = await webSearch(searchQuery(thread, latest), req.signal);
        if (found) {
          web = webBlock(found.sources, found.excerpts);
          searchUsd = found.usd;
          controller.enqueue(send({ type: "sources", sources: found.sources }));
        }
      }
      const source = streamChat({
        messages: buildMessages(doc, thread, history, isLengthKey(body.length) ? body.length : "normal", web),
        model,
        apiKey,
        maxTokens: body.length === "long" ? 1400 : 900,
        signal: req.signal,
      });
      let cost: number | null = null;
      try {
        for await (const event of source) {
          if (event.type === "usage") cost = event.usage.costUsd;
          controller.enqueue(send(event));
        }
      } catch (e) {
        if (!req.signal.aborted) controller.enqueue(send({ type: "error", text: `Stream failed: ${String(e)}` }));
      } finally {
        controller.close();
        if (free) await chargeFree(free.subject, (cost ?? estimateUsd(docChars, MODELS[model].inPerM)) + searchUsd);
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...(free ? { "X-Free-Left": free.left.toFixed(3) } : {}),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
