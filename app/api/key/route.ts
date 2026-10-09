import { APP_UA } from "@/lib/together";

export const runtime = "nodejs";

/** Validates a pasted key with a zero-cost model listing. The key is never stored or logged. */
export async function POST(req: Request) {
  let body: { apiKey?: string } = {};
  try {
    body = await req.json();
  } catch {}
  const key = body.apiKey?.trim();
  if (!key) return Response.json({ ok: false });
  try {
    const res = await fetch("https://api.together.xyz/v1/models", {
      headers: { Authorization: `Bearer ${key}`, "User-Agent": APP_UA },
      signal: AbortSignal.timeout(10_000),
    });
    return Response.json({ ok: res.ok });
  } catch {
    return Response.json({ ok: false });
  }
}

/** Whether the server has a house key, so the UI can say "demo" honestly. */
export async function GET() {
  return Response.json({ house: Boolean(process.env.TOGETHER_API_KEY) });
}
