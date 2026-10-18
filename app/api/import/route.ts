import { fetchArticle } from "@/lib/fetch-article";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  // `pdf`: the caller can read a PDF in the browser, so a PDF link comes back as the file.
  let body: { url?: unknown; pdf?: unknown };
  try {
    const j = await req.json();
    if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("not an object");
    body = j;
  } catch {
    return Response.json({ error: "Body must be JSON, like {\"url\": \"https://...\"}." }, { status: 400 });
  }
  let r;
  try {
    r = await fetchArticle(body.url, { pdf: Boolean(body.pdf) });
  } catch {
    return Response.json({ error: "Something went wrong reading that page. Try again, or use Paste text." }, { status: 500 });
  }
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  if ("pdf" in r) return new Response(r.pdf, { headers: { "Content-Type": "application/pdf", "X-File-Name": encodeURIComponent(r.name) } });
  return Response.json({ article: r.article });
}
