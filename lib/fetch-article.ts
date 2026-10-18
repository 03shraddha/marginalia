/**
 * Reading a web page into an Article, on the server: the link import, and
 * anything an agent saves. Every redirect hop is checked against private,
 * loopback and link-local addresses before it is fetched.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { parseHTML } from "linkedom";
import { imageStem, leadImage, prepareImages } from "@/lib/images";
import { Readability } from "@mozilla/readability";
import { htmlToBlocks } from "@/lib/html-to-blocks";
import { slugify, textToArticle, tidyTitle, undash, type Article, type Block } from "@/lib/article";
import { APP_UA } from "@/lib/llm";

const MAX_BYTES = 6_000_000;
const MAX_PDF_BYTES = 25_000_000;
/** Past this much text the article would not fit the reader's storage. */
const MAX_TEXT_CHARS = 1_500_000;
/** The whole fetch, every redirect hop and the body, must finish within this. */
const FETCH_MS = 20_000;
const MAX_HOPS = 5;
const MAX_INPUT = 8_000;
const MAX_URL = 2_048;
/** Fewer words than this is a page whose article never reached the HTML. The shortest real one on a tested shelf had 220. */
const MIN_WORDS = 80;

export type Fail = { ok: false; error: string; status: number };
const fail = (error: string, status: number): Fail => ({ ok: false, error, status });

const NOT_REACHABLE = "That address is not reachable from here. Use a link to a public web page.";
const NOT_A_LINK = "That does not look like a link. Paste a web address like example.com/page.";

/** A blocked IPv4 range: private, loopback, link-local, shared, documentation, benchmarking, multicast and reserved. */
function blockedV4(p: number[]): boolean {
  const [a, b, c] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

/** The 16 bytes of an IPv6 address, or null when it is malformed. */
function v6Bytes(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0];
  if (s.includes(".")) {
    const colon = s.lastIndexOf(":");
    const q = s.slice(colon + 1).split(".").map(Number);
    if (q.length !== 4 || q.some((n) => !(n >= 0 && n <= 255))) return null;
    s = `${s.slice(0, colon + 1)}${((q[0] << 8) | q[1]).toString(16)}:${((q[2] << 8) | q[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const groups = (h: string) => (h ? h.split(":") : []);
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  const out: number[] = [];
  for (const g of all) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    out.push(n >> 8, n & 255);
  }
  return out;
}

/** Refuse anything that is not a public address. */
export function isPrivate(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return blockedV4(ip.split(".").map(Number));
  if (kind !== 6) return true;
  const b = v6Bytes(ip);
  if (!b) return true;
  const w = (i: number) => b[i] * 256 + b[i + 1];
  if (b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff) return blockedV4(b.slice(12)); // ::ffff:a.b.c.d
  if (b.slice(0, 12).every((x) => x === 0)) return true; // ::, ::1, ::a.b.c.d
  if (w(0) === 0x64 && w(2) === 0xff9b && b.slice(4, 12).every((x) => x === 0)) return blockedV4(b.slice(12)); // NAT64
  if (w(0) === 0x2002) return blockedV4(b.slice(2, 6)); // 6to4
  if (w(0) === 0x2001 && (w(2) === 0 || w(2) === 0xdb8)) return true; // Teredo, documentation
  if ((b[0] & 0xfe) === 0xfc) return true; // fc00::/7 unique local
  if (b[0] === 0xfe && (b[1] & 0x80) === 0x80) return true; // fe80::/10 link-local, fec0::/10 site-local
  return b[0] === 0xff; // multicast
}

const OTHER_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i;
const HTTP_URL = /^https?:\/\//i;
const DOMAIN_LIKE = /^(?:(?:[\p{L}\p{N}_-]+\.)+\p{L}{2,}|\d{1,3}(?:\.\d{1,3}){3}|localhost|\[[0-9a-f:.]+\])(?::\d+)?(?:[/?#]\S*)?$/iu;

/** A pasted token with the wrapping around it taken off: <url>, "url", (url), url. */
function cleanToken(t: string): string {
  t = t.replace(/^[<(\[{"'“‘«]+/, "");
  const close = /[>\]}"'”’».,;:!?]+$/;
  t = t.replace(close, "");
  // A closing ")" belongs to the link only when the link has its own "(", as in a Wikipedia title.
  while (t.endsWith(")") && (t.match(/\(/g)?.length ?? 0) < (t.match(/\)/g)?.length ?? 0)) t = t.slice(0, -1).replace(close, "");
  return t;
}

/**
 * The one link in what was pasted: a bare link, one in <angle brackets> or
 * quotes, a Markdown link, or a link with a few words around it.
 */
export function parseInput(raw: unknown): { url: URL } | Fail {
  if (typeof raw !== "string" || !raw.trim()) return fail("Paste a link first.", 400);
  if (raw.length > MAX_INPUT) return fail("That is too long to be a link. Paste just the link.", 400);
  if (/[\u0000-\u0008\u000e-\u001f\u007f]/.test(raw)) return fail(NOT_A_LINK, 400);
  const text = raw.replace(/\[[^\]]*\]\(([^)\s]+)\)/g, " $1 ");
  const tokens = text.split(/\s+/).map(cleanToken).filter(Boolean);
  const solo = tokens.length === 1;
  const isLink = (t: string) => HTTP_URL.test(t) || OTHER_SCHEME.test(t) || DOMAIN_LIKE.test(t) || (solo && /^\d+(\.\d+){1,3}$/.test(t));
  let found = [...new Set(tokens.filter(isLink))];
  // A web address wins over a stray word that only looks like a domain ("notes.txt").
  const web = found.filter((t) => HTTP_URL.test(t));
  if (web.length) found = web;
  if (!found.length) return fail(NOT_A_LINK, 400);
  if (found.length > 1) return fail("That has more than one link. Paste one link at a time.", 400);
  const one = found[0];
  if (!HTTP_URL.test(one) && OTHER_SCHEME.test(one)) return fail("Only http and https links can be imported.", 400);
  if (one.length > MAX_URL) return fail("That link is too long to import.", 400);
  let url: URL;
  try {
    url = new URL(HTTP_URL.test(one) ? one : `https://${one}`);
  } catch {
    return fail(NOT_A_LINK, 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return fail("Only http and https links can be imported.", 400);
  return { url };
}

/** Null when the address may be fetched; otherwise why not. Run on the first URL and on every redirect. */
async function checkUrl(url: URL): Promise<Fail | null> {
  if (url.protocol !== "http:" && url.protocol !== "https:") return fail("Only http and https links can be imported.", 400);
  if (url.username || url.password) return fail("Links with a username or password in them cannot be imported.", 400);
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host) return fail(NOT_A_LINK, 400);
  const ip = isIP(host);
  if (!ip && (!host.includes(".") || /\.(local|localhost|internal|lan|home|corp|intranet|home\.arpa)$/.test(host))) return fail(NOT_REACHABLE, 400);
  try {
    const ips = ip ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
    if (!ips.length) return fail("Could not find that site. Check the link.", 502);
    if (ips.some(isPrivate)) return fail(NOT_REACHABLE, 400);
  } catch {
    return fail("Could not find that site. Check the link.", 502);
  }
  return null;
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

/**
 * React streaming (Next.js App Router, Suspense) sends a skeleton first:
 * `<!--$?--><template id="B:6"></template>...fallback...<!--/$-->`, and the real
 * content later in `<div hidden id="S:6">`, which a script ($RC) moves into
 * place. Readability drops hidden nodes, so the article went with it. This does
 * the script's work: the content replaces its placeholder and the fallback goes.
 * A segment for `<template id="P:9">` ($RS) replaces that template.
 */
function revealStreamed(doc: Document) {
  for (const seg of Array.from(doc.querySelectorAll("div[hidden]"))) {
    const m = /^S:(\d+)$/.exec(seg.id);
    if (!m) continue;
    const boundary = doc.getElementById(`B:${m[1]}`);
    const slot = boundary ?? doc.getElementById(`P:${m[1]}`);
    if (!slot?.parentNode) {
      seg.removeAttribute("hidden");
      continue;
    }
    if (boundary) {
      // The fallback runs from the template to the comment that closes its boundary.
      let depth = 0;
      for (let n = boundary.nextSibling; n; ) {
        const next = n.nextSibling;
        if (n.nodeType === 8) {
          const data = (n as Comment).data;
          if (data === "/$") {
            if (depth === 0) break;
            depth--;
          } else if (data === "$" || data === "$?" || data === "$!") depth++;
        }
        n.parentNode?.removeChild(n);
        n = next;
      }
    }
    while (seg.firstChild) slot.parentNode.insertBefore(seg.firstChild, slot);
    slot.parentNode.removeChild(slot);
    seg.parentNode?.removeChild(seg);
  }
}

const SOCIAL = /^(x\.com|twitter\.com|mobile\.twitter\.com|threads\.net|bsky\.app|instagram\.com|facebook\.com|linkedin\.com\/posts)/;
const VIDEO = /^(youtube\.com|m\.youtube\.com|music\.youtube\.com|youtu\.be|vimeo\.com|tiktok\.com)\//;

/** Links that are a post or a video rather than an article: their pages are script shells with nothing to read. */
export function notAnArticle(url: string): "social" | "video" | null {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
  } catch {
    return null;
  }
  const at = `${u.hostname.replace(/^www\./, "")}${u.pathname}`;
  return SOCIAL.test(at) ? "social" : VIDEO.test(at) ? "video" : null;
}

/** arXiv ids: new style (2610.07469v2) and old style (cs/9605103, math.GT/0309136). */
const ARXIV = /^(?:www\.|export\.)?arxiv\.org\/(?:abs|pdf)\/((?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?)(?:\.pdf)?\/?$/;

/**
 * The full text of an arXiv paper, for a link to its abstract page: that page
 * holds only the abstract, so a reader that can take a PDF gets the PDF, and
 * one that can't (an agent) gets arXiv's HTML rendering of the paper.
 */
export function arxivFullText(url: string, as: "pdf" | "html"): string | null {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
  } catch {
    return null;
  }
  const m = ARXIV.exec(`${u.hostname}${u.pathname}`);
  if (!m) return null;
  if (as === "pdf") return u.pathname.startsWith("/abs/") ? `https://arxiv.org/pdf/${m[1]}` : null;
  return `https://arxiv.org/html/${m[1]}`;
}

export type FetchResult =
  | { ok: true; article: Article }
  | { ok: true; pdf: ArrayBuffer; name: string }
  | Fail;

const TIMED_OUT = "The site took too long to answer. Try again, or paste the text instead.";
const NEEDS_SCRIPTS = "That page draws its text with scripts, so it cannot be read here. Copy the text and use Paste text.";
const TOO_LITTLE = "That page has too little text to read. It may need a login or sit behind a paywall. Copy the text and use Paste text.";
const NO_ARTICLE = "Could not find an article on that page. Open the article itself, or use Paste text.";

const timedOut = (e: unknown) => e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");

/** The body, read as it arrives and dropped the moment it passes the cap, so a huge page never sits in memory. */
async function readCapped(res: Response, max: number): Promise<Uint8Array | "big"> {
  const len = Number(res.headers.get("content-length"));
  if (len > max) {
    void res.body?.cancel().catch(() => {});
    return "big";
  }
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) {
      void reader.cancel().catch(() => {});
      return "big";
    }
    chunks.push(value);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Bytes to text by the page's own charset: the header, a byte-order mark, or a <meta> tag; else UTF-8, else windows-1252 as browsers do. */
function decode(buf: Uint8Array, type: string): string {
  let cs = /charset\s*=\s*["']?([\w:.-]+)/i.exec(type)?.[1];
  if (!cs) {
    if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) cs = "utf-8";
    else if (buf[0] === 0xff && buf[1] === 0xfe) cs = "utf-16le";
    else if (buf[0] === 0xfe && buf[1] === 0xff) cs = "utf-16be";
    else cs = /<meta[^>]+charset\s*=\s*["']?\s*([\w:.-]+)/i.exec(new TextDecoder("latin1").decode(buf.subarray(0, 4096)))?.[1];
  }
  try {
    return new TextDecoder(cs ?? "utf-8", { fatal: !cs }).decode(buf);
  } catch {
    try {
      return new TextDecoder(cs ? "utf-8" : "windows-1252").decode(buf);
    } catch {
      return new TextDecoder().decode(buf);
    }
  }
}

/** A GitHub link to a Markdown or text file, as the raw file: the page around it is the site, not the document. */
function githubRaw(u: URL): URL | null {
  if (u.hostname !== "github.com") return null;
  const m = /^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+\.(?:md|markdown|txt))$/i.exec(u.pathname);
  return m ? new URL(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`) : null;
}

/**
 * Some sites ship a chart or table as base64 HTML in a <template> for a script
 * to unpack (microsoft.ai). The text, tables and captions in it are the
 * article's, so they are unpacked here; any other template is inert and goes.
 */
function unpackTemplates(doc: Document) {
  for (const t of Array.from(doc.querySelectorAll("template"))) {
    const raw = (t.textContent ?? "").trim();
    let html = "";
    if (raw.length > 80 && /^[A-Za-z0-9+/=\s]+$/.test(raw)) {
      try {
        html = Buffer.from(raw, "base64").toString("utf8");
      } catch {}
    }
    if (!html.includes("<")) {
      t.parentNode?.removeChild(t);
      continue;
    }
    html = html
      .replace(/<(style|script|noscript|template)\b[\s\S]*?<\/\1>/gi, "")
      .replace(/<meta\b[^>]*>/gi, "")
      .replace(/\s(?:src|href|srcset)="data:[^"]*"/gi, "");
    const holder = doc.createElement("div");
    holder.innerHTML = html;
    t.parentNode?.replaceChild(holder, t);
  }
}

const jsonLd = (doc: Document): unknown[] => {
  const out: unknown[] = [];
  for (const s of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      out.push(JSON.parse(s.textContent ?? ""));
    } catch {}
  }
  return out;
};

function findKey(node: unknown, key: string, depth = 0): unknown {
  if (!node || typeof node !== "object" || depth > 6) return undefined;
  if (Array.isArray(node)) {
    for (const n of node) {
      const v = findKey(n, key, depth + 1);
      if (v) return v;
    }
    return undefined;
  }
  const o = node as Record<string, unknown>;
  if (o[key]) return o[key];
  for (const v of Object.values(o)) {
    const f = findKey(v, key, depth + 1);
    if (f) return f;
  }
  return undefined;
}

const validDate = (s: unknown): string | undefined => (typeof s === "string" && s && !Number.isNaN(new Date(s).getTime()) ? s : undefined);

/** The date a page says it was published, from its metadata, which Readability only reads from some of these. */
function pageDate(doc: Document, ld: unknown[]): string | undefined {
  for (const sel of ['meta[property="article:published_time"]', 'meta[property="og:article:published_time"]', 'meta[itemprop="datePublished"]', 'meta[name="date"]', 'meta[name="publish_date"]', 'meta[name="pubdate"]', 'meta[name="DC.date.issued"]', 'meta[name="parsely-pub-date"]', 'meta[name="sailthru.date"]']) {
    const v = validDate(doc.querySelector(sel)?.getAttribute("content"));
    if (v) return v;
  }
  const v = validDate(findKey(ld, "datePublished"));
  if (v) return v;
  return validDate(doc.querySelector('article time[datetime], main time[datetime], time[itemprop="datePublished"]')?.getAttribute("datetime"));
}

function pageAuthor(ld: unknown[]): string | undefined {
  const a = findKey(ld, "author");
  const one = Array.isArray(a) ? a[0] : a;
  const name = typeof one === "string" ? one : (one as { name?: unknown } | undefined)?.name;
  return typeof name === "string" && name.trim() && name.length < 80 ? name.trim() : undefined;
}

/** "Title | Site" and "Title - Site" down to the title, when the page's own headline or site name says which part is which. */
function cleanTitle(title: string, h1s: string[], site: string | undefined, host: string): string {
  const sep = /\s+[|–—·•:-]\s+/;
  for (const h of h1s) {
    if (h.length >= 4 && title.startsWith(h) && /^\s+[|\u2013\u2014\u00B7\u2022:-]\s/.test(`${title.slice(h.length)} `)) return h;
  }
  const brand = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const names = [site, host.split(".").slice(-2, -1)[0]].filter(Boolean).map((s) => brand(s!));
  const parts = title.split(sep);
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (names.includes(brand(last))) return title.slice(0, title.length - last.length).replace(/\s+[|–—·•:-]\s*$/, "").trim() || title;
  }
  return title;
}

const wordsIn = (b: Block) => b.runs.map((r) => r.text).join("").split(/\s+/).filter(Boolean).length;
const textIn = (b: Block) => b.runs.map((r) => r.text).join("").trim();
const MONTH = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}(,? \d{4})?\b|\b\d{1,2} (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{4}\b|^\d{4}-\d{2}-\d{2}$/i;

/**
 * Page furniture that Readability leaves at the head of the article: a category
 * label ("Lab Notes"), a date, a byline. They are read for what they say, then dropped.
 */
function trimHead(blocks: Block[]): { blocks: Block[]; date?: string; author?: string } {
  let date: string | undefined;
  let author: string | undefined;
  let i = 0;
  while (i < blocks.length && i < 6) {
    const b = blocks[i];
    const t = textIn(b);
    if (b.type !== "p" || wordsIn(b) > 8 || /[.!?…]["”)]?$/.test(t)) break;
    if (MONTH.test(t) && !Number.isNaN(new Date(t).getTime())) date ??= t;
    else {
      const by = /^by\s+(.{3,60})$/i.exec(t);
      if (by) author ??= by[1];
    }
    i++;
  }
  // Only a run of such lines before the body counts: if no real paragraph follows, keep everything.
  if (i === 0 || i >= blocks.length) return { blocks };
  return { blocks: blocks.slice(i), date, author };
}

/** A "More stories" heading with nothing under it is a teaser rail cut off from its cards. */
function trimTail(blocks: Block[]): Block[] {
  let n = blocks.length;
  while (n > 1 && (blocks[n - 1].type === "h2" || blocks[n - 1].type === "h3")) n--;
  return n === blocks.length ? blocks : blocks.slice(0, n);
}

/** `pdf`: the caller can read a PDF itself, so a PDF link comes back as the file instead of an error. */
export async function fetchArticle(raw: unknown, opts: { pdf?: boolean } = {}): Promise<FetchResult> {
  const input = parseInput(raw);
  if ("ok" in input) return input;
  let start = input.url;
  const viaArxiv = opts.pdf ? arxivFullText(start.toString(), "pdf") : null;
  if (viaArxiv) start = new URL(viaArxiv);
  start = githubRaw(start) ?? start;
  const kind = notAnArticle(start.toString());
  if (kind === "social") return fail("That's a post, not an article. Open the link it shares, or copy the post and use Paste text.", 422);
  if (kind === "video") return fail("That's a video, and Marginalia reads text. Copy its transcript and use Paste text.", 422);
  const blocked = await checkUrl(start);
  if (blocked) return blocked;

  // Follow redirects by hand so every hop gets the same private-address check.
  // One clock covers every hop and the body: a site that stalls part way ends the same as one that never answers.
  const signal = AbortSignal.timeout(FETCH_MS);
  let res!: Response;
  let target: URL = start;
  try {
    for (let hop = 0; ; hop++) {
      res = await fetch(target, {
        redirect: "manual",
        signal,
        headers: {
          "User-Agent": `Mozilla/5.0 (compatible; ${APP_UA}; +reader)`,
          Accept: opts.pdf ? "text/html,application/xhtml+xml,application/pdf,text/markdown,text/plain" : "text/html,application/xhtml+xml,text/markdown,text/plain",
        },
      });
      const location = [301, 302, 303, 307, 308].includes(res.status) ? res.headers.get("location") : null;
      if (!location) break;
      void res.body?.cancel().catch(() => {});
      if (hop >= MAX_HOPS) return fail("That link sends you round in circles (too many redirects). Check the link, or use Paste text.", 502);
      let next: URL;
      try {
        next = new URL(location, target);
      } catch {
        return fail("That link redirects to an address that is not valid. Check the link.", 502);
      }
      const bad = await checkUrl(next);
      if (bad) return bad;
      target = next;
    }
  } catch (e) {
    return timedOut(e) || signal.aborted ? fail(TIMED_OUT, 504) : fail("Could not connect to that site. Check the link, or try again.", 502);
  }
  if (!res.ok) {
    void res.body?.cancel().catch(() => {});
    const s = res.status;
    if (s === 401 || s === 403) return fail("That site does not let readers like this one in. Copy the text and use Paste text instead.", 403);
    if (s === 429) return fail("That site is limiting requests right now. Wait a minute and try again, or use Paste text.", 429);
    if (s === 404 || s === 410) return fail("That page was not found. Check the link.", 404);
    return fail(`The site answered ${s}. Try again later, or use Paste text.`, 502);
  }

  const type = (res.headers.get("content-type") ?? "").toLowerCase();
  try {
    if (type.includes("application/pdf")) {
      if (!opts.pdf) {
        void res.body?.cancel().catch(() => {});
        return fail("That link is a PDF. Download it, then drop the file here.", 415);
      }
      const pdf = await readCapped(res, MAX_PDF_BYTES);
      if (pdf === "big") return fail("That PDF is too large to import. Download it, then drop the file here.", 413);
      let name = "document.pdf";
      try {
        name = decodeURIComponent(target.pathname.split("/").pop() || name);
      } catch {}
      return { ok: true, pdf: pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer, name: name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf` };
    }
    const isText = /^text\/(plain|markdown|x-markdown)\b/.test(type);
    if (type && !isText && !type.includes("html")) {
      void res.body?.cancel().catch(() => {});
      if (type.startsWith("image/")) return fail("That link is an image, not an article. Open the page it sits on.", 415);
      if (type.includes("xml") || type.includes("json")) return fail("That link is a data feed, not an article. Open one of its posts instead.", 415);
      return fail("That link is a file, not a web page. Open the page that holds the article, or use Paste text.", 415);
    }

    const buf = await readCapped(res, MAX_BYTES);
    if (buf === "big") return fail("That page is too large to import. Use Paste text for the part you want.", 413);
    const html = decode(buf, type);
    if (isText) {
      if (html.length > MAX_TEXT_CHARS) return fail("That file is too long to import. Use Paste text for the part you want.", 413);
      const a = textToArticle(html, { origin: "url" });
      if (!a.blocks.length) return fail("That file has no readable text.", 422);
      if (a.title === "Untitled") a.title = decodeURIComponent(target.pathname.split("/").pop() || target.hostname).replace(/\.(txt|md|markdown)$/i, "").replace(/[_-]+/g, " ") || target.hostname;
      a.source = target.hostname.replace(/^www\./, "");
      a.sourceUrl = target.toString();
      return { ok: true, article: a };
    }
    // No Content-Type at all: serve it as HTML only when the bytes look like HTML.
    if (!type && !/^\s*<(!doctype|html|head|body|\?xml|meta|title|div|article)/i.test(html.slice(0, 512))) return fail("That link is a file, not a web page. Open the page that holds the article, or use Paste text.", 415);
    return await readPage(html, target);
  } catch (e) {
    return timedOut(e) || signal.aborted ? fail(TIMED_OUT, 504) : fail("Something went wrong reading that page. Try again, or use Paste text.", 502);
  }
}

async function readPage(html: string, target: URL): Promise<FetchResult> {
  const { document } = parseHTML(html);
  // A page's own <base> sets where its relative links point. Without one, the page's address does.
  let base = target.toString();
  try {
    const own = document.querySelector("base[href]")?.getAttribute("href");
    if (own) base = new URL(own, target).toString();
    else {
      const el = document.createElement("base");
      el.setAttribute("href", base);
      document.head?.appendChild(el);
    }
  } catch {}
  if (!/^https?:/i.test(base)) base = target.toString();

  // Pages streamed by React arrive with their content hidden, to be swapped in by a script.
  try {
    revealStreamed(document as unknown as Document);
  } catch {}
  try {
    unpackTemplates(document as unknown as Document);
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
    lead = leadImage(document as unknown as Document, base);
  } catch {}
  let ld: unknown[] = [];
  let h1s: string[] = [];
  let metaDate: string | undefined;
  try {
    ld = jsonLd(document as unknown as Document);
    metaDate = pageDate(document as unknown as Document, ld);
    h1s = Array.from(document.querySelectorAll("h1")).slice(0, 3).map((h) => (h.textContent ?? "").replace(/\s+/g, " ").trim());
  } catch {}

  // Pictures resolved to one real URL each and rewrapped as plain figures, so Readability keeps them.
  try {
    prepareImages(document as unknown as Document, base);
  } catch {
    // Pictures are a bonus; never lose the article over them.
  }

  let parsed: ReturnType<Readability["parse"]> = null;
  try {
    parsed = new Readability(document as unknown as Document, { charThreshold: 400 }).parse();
  } catch {
    // Some unusual markup trips Readability up; that reads the same as no article found.
  }
  const drawnByScripts = () =>
    ((html.match(/<script\b/gi)?.length ?? 0) >= 2 || /id=["'](root|app|__next|__nuxt|___gatsby)["']/.test(html)) &&
    html.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length < 120;
  if (!parsed?.content) return fail(drawnByScripts() ? NEEDS_SCRIPTS : NO_ARTICLE, 422);

  const { document: clean } = parseHTML(`<!doctype html><html><body><div id="r">${parsed.content}</div></body></html>`);
  const root = clean.getElementById("r");
  if (!root) return fail("Could not read that article.", 422);
  let blocks = htmlToBlocks(root as never, base);
  const title = tidyTitle(undash(cleanTitle((parsed.title || target.hostname).trim(), h1s, parsed.siteName ?? undefined, target.hostname)));
  if (blocks[0] && blocks[0].type !== "p" && textIn(blocks[0]) === title) blocks = blocks.slice(1);
  const head = trimHead(blocks);
  blocks = trimTail(head.blocks);
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
  // A page drawn by scripts (a Google Doc, an app shell) leaves only its newsletter box and footer.
  const words = blocks.reduce((n, b) => n + wordsIn(b), 0);
  if (blocks.filter((b) => b.type === "p").length < 2 || words < MIN_WORDS) return fail(drawnByScripts() ? NEEDS_SCRIPTS : TOO_LITTLE, 422);
  if (blocks.reduce((n, b) => n + textIn(b).length, 0) > MAX_TEXT_CHARS) return fail("That page is too long to import. Use Paste text for the part you want.", 413);

  const when = validDate(parsed.publishedTime) ?? metaDate ?? head.date;
  const byline = parsed.byline?.replace(/^by\s+/i, "").trim() || pageAuthor(ld) || head.author;
  const article: Article = {
    id: `${slugify(title)}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    author: byline ? undash(byline).slice(0, 120) : undefined,
    published: when ? String(new Date(when).getFullYear()) : undefined,
    dek: dekFrom(parsed.excerpt, blocks),
    source: parsed.siteName ?? target.hostname.replace(/^www\./, ""),
    sourceUrl: target.toString(),
    blocks,
    origin: "url",
    image: lead ?? undefined,
    addedAt: Date.now(),
  };
  return { ok: true, article };
}
