import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { parseHTML } from "linkedom";
import { imageStem, leadImage, prepareImages } from "@/lib/images";
import { Readability } from "@mozilla/readability";
import { htmlToBlocks } from "@/lib/html-to-blocks";
import { slugify, tidyTitle, undash, type Article, type Block } from "@/lib/article";
import { APP_UA } from "@/lib/together";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 6_000_000;

/** Refuse anything that resolves to a private, loopback or link-local address. */
function isPrivate(ip: string): boolean {
  if (ip === "::1" || ip === "::" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const p = v4.split(".").map(Number);
  if (p.length !== 4) return false;
  return (
    p[0] === 10 ||
    p[0] === 127 ||
    p[0] === 0 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127)
  );
}

async function safeUrl(raw: string): Promise<URL | string> {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return "That does not look like a link.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "Only http and https links can be imported.";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return "That address is not reachable from here.";
  try {
    const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
    if (ips.some(isPrivate)) return "That address is not reachable from here.";
  } catch {
    return "Could not find that site. Check the link.";
  }
  return url;
}

/** Readability's excerpt is often just the first paragraph; only keep it when it adds something. */
function dekFrom(excerpt: string | null | undefined, blocks: Block[]): string | undefined {
  const dek = undash((excerpt ?? "").trim());
  if (dek.length < 20) return undefined;
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const first = norm(blocks.find((b) => b.type === "p")?.runs.map((r) => r.text).join("") ?? "");
  if (first.startsWith(norm(dek).slice(0, 60))) return undefined;
  return dek.length > 280 ? `${dek.slice(0, 277).replace(/\s+\S*$/, "")}...` : dek;
}

export async function POST(req: Request) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const checked = await safeUrl((body.url ?? "").trim());
  if (typeof checked === "string") return Response.json({ error: checked }, { status: 400 });

  // Follow redirects by hand so every hop gets the same private-address check.
  let res: Response | null = null;
  let target: URL = checked;
  try {
    for (let hop = 0; hop < 5; hop++) {
      res = await fetch(target, {
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "User-Agent": `Mozilla/5.0 (compatible; ${APP_UA}; +reader)`,
          Accept: "text/html,application/xhtml+xml",
        },
      });
      const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!location) break;
      const next = await safeUrl(new URL(location, target).toString());
      if (typeof next === "string") return Response.json({ error: next }, { status: 400 });
      target = next;
    }
  } catch {
    return Response.json({ error: "The site did not answer in time." }, { status: 502 });
  }
  if (!res || !res.ok) {
    const status = res?.status ?? 0;
    const msg =
      status === 401 || status === 403 || status === 429
        ? "That site does not let readers like this one in. Copy the text and use Paste text instead."
        : status === 404
          ? "That page was not found. Check the link."
          : `The site answered ${status || "nothing"}. Try again, or paste the text instead.`;
    return Response.json({ error: msg }, { status: 502 });
  }

  const type = res.headers.get("content-type") ?? "";
  if (type.includes("application/pdf")) {
    return Response.json({ error: "That link is a PDF. Download it, then drop the file here." }, { status: 415 });
  }
  if (!type.includes("html")) return Response.json({ error: "That link is not a web page." }, { status: 415 });

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return Response.json({ error: "That page is too large to import." }, { status: 413 });
  const html = new TextDecoder().decode(buf);

  const { document } = parseHTML(html);
  // Readability resolves relative links against the document URL.
  try {
    const base = document.createElement("base");
    base.setAttribute("href", target.toString());
    document.head?.appendChild(base);
  } catch {}

  // Data tables (header cells or a caption) often carry classes like "sticky-header"
  // that Readability reads as page furniture and strips. Their classes go, so they stay.
  for (const t of Array.from(document.querySelectorAll("table"))) {
    const role = t.getAttribute("role");
    if (role === "presentation" || role === "navigation") continue;
    if (t.querySelector("th, thead, caption")) t.removeAttribute("class");
  }

  // Read before Readability, which rewrites the document it is given.
  let lead: string | null = null;
  try {
    lead = leadImage(document as unknown as Document, target.toString());
  } catch {}

  // Pictures resolved to one real URL each and rewrapped as plain figures, so Readability keeps them.
  try {
    prepareImages(document as unknown as Document, target.toString());
  } catch {
    // Pictures are a bonus; never lose the article over them.
  }

  let parsed: ReturnType<Readability["parse"]> = null;
  try {
    parsed = new Readability(document as unknown as Document, { charThreshold: 400 }).parse();
  } catch {
    // Some unusual markup trips Readability up; that reads the same as no article found.
  }
  if (!parsed?.content) {
    return Response.json({ error: "Could not find an article on that page. Try pasting the text instead." }, { status: 422 });
  }

  const { document: clean } = parseHTML(`<!doctype html><html><body><div id="r">${parsed.content}</div></body></html>`);
  const root = clean.getElementById("r");
  if (!root) return Response.json({ error: "Could not read that article." }, { status: 422 });
  let blocks = htmlToBlocks(root as never, target.toString());
  const title = tidyTitle(undash((parsed.title || target.hostname).trim()));
  if (blocks[0] && blocks[0].type !== "p" && blocks[0].runs.map((r) => r.text).join("").trim() === title) blocks = blocks.slice(1);
  // The lead picture goes first, unless the article already opens with a picture or shows this one.
  const leadStem = lead ? imageStem(lead) : null;
  const shownAlready = (src?: string) => {
    if (!src || !leadStem) return false;
    try {
      return decodeURIComponent(src).includes(leadStem);
    } catch {
      return src.includes(leadStem);
    }
  };
  if (lead && !blocks.slice(0, 4).some((b) => b.type === "figure") && !blocks.some((b) => b.type === "figure" && shownAlready(b.src))) {
    blocks = [{ id: "b0", type: "figure", runs: [], src: lead }, ...blocks];
  }
  if (blocks.filter((b) => b.type === "p").length < 2) {
    return Response.json({ error: "That page has too little text to read here." }, { status: 422 });
  }

  const article: Article = {
    id: `${slugify(title)}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    author: parsed.byline ? undash(parsed.byline.replace(/^by\s+/i, "").trim()).slice(0, 120) : undefined,
    published: parsed.publishedTime ? new Date(parsed.publishedTime).getFullYear().toString() : undefined,
    dek: dekFrom(parsed.excerpt, blocks),
    source: parsed.siteName ?? target.hostname.replace(/^www\./, ""),
    sourceUrl: target.toString(),
    blocks,
    origin: "url",
    addedAt: Date.now(),
  };
  return Response.json({ article });
}
