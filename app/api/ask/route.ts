import { buildMessages, demoAnswer, isLengthKey, type DocPayload, type ThreadPayload } from "@/lib/prompts";
import { DEFAULT_MODEL, isModelKey, streamChat, streamDemo, type StreamEvent } from "@/lib/together";
import { ACTIONS } from "@/lib/actions";
import { allow, clientId } from "@/lib/ratelimit";

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
  const haveKey = Boolean(apiKey || process.env.TOGETHER_API_KEY);
  if (!apiKey && haveKey && !allow(`ask:${clientId(req)}`, 120, 60 * 60 * 1000)) {
    return Response.json({ error: "The shared key has answered a lot for you this hour. Add your own Together key to keep going." }, { status: 429 });
  }

  const encoder = new TextEncoder();
  const send = (e: StreamEvent) => encoder.encode(`data: ${JSON.stringify(e)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      const source = haveKey
        ? streamChat({
            messages: buildMessages(doc, thread, history, isLengthKey(body.length) ? body.length : "normal"),
            model,
            apiKey,
            maxTokens: body.length === "long" ? 1400 : 900,
            signal: req.signal,
          })
        : streamDemo(demoAnswer(thread));
      try {
        for await (const event of source) controller.enqueue(send(event));
      } catch (e) {
        if (!req.signal.aborted) controller.enqueue(send({ type: "error", text: `Stream failed: ${String(e)}` }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
