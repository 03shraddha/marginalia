"use client";

import { slugify, tidyTitle, undash, type Article, type Block } from "./article";

/**
 * PDF to Gloss blocks, in the browser. Best effort for prose: it rebuilds
 * lines from positioned glyph runs, drops running headers and page numbers,
 * joins hyphenated breaks, and splits paragraphs on vertical gaps. Scanned
 * PDFs (images only) have no text layer and are reported as such.
 */

type Line = { text: string; y: number; x: number; size: number; page: number };

const MAX_PAGES = 400;

export async function pdfToArticle(file: File, onProgress?: (p: number) => void): Promise<Article> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = Math.min(doc.numPages, MAX_PAGES);

  const lines: Line[] = [];
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let cur: Line | null = null;
    let lastRight = 0;
    for (const raw of content.items) {
      if (!("str" in raw)) continue;
      const it = raw as { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean };
      const size = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
      const x = it.transform[4];
      const y = it.transform[5];
      if (!it.str && !it.hasEOL) continue;
      if (cur && Math.abs(cur.y - y) < size * 0.45) {
        const gap = x - lastRight;
        if (gap > size * 0.12 && !cur.text.endsWith(" ") && !it.str.startsWith(" ")) cur.text += " ";
        cur.text += it.str;
        cur.size = Math.max(cur.size, size);
      } else {
        if (cur && cur.text.trim()) lines.push(cur);
        cur = { text: it.str, y, x, size, page: p };
      }
      lastRight = x + it.width;
    }
    if (cur && cur.text.trim()) lines.push(cur);
    onProgress?.(p / pages);
  }

  if (lines.length < 5) throw new Error("This PDF has no text layer (it may be a scan), so there is nothing to read here.");

  // Running heads, feet and page numbers repeat across pages: drop them.
  const norm = (s: string) => s.trim().toLowerCase().replace(/\d+/g, "#");
  const freq = new Map<string, Set<number>>();
  for (const l of lines) {
    const k = norm(l.text);
    if (k.length > 80) continue;
    const set = freq.get(k) ?? new Set<number>();
    set.add(l.page);
    freq.set(k, set);
  }
  const repeated = (l: Line) => pages >= 3 && (freq.get(norm(l.text))?.size ?? 0) >= Math.max(3, pages * 0.4);
  const kept = lines.filter((l) => !/^\s*(page\s*)?\d{1,4}\s*(of\s*\d+)?\s*$/i.test(l.text) && !repeated(l));

  // Typical body size and line spacing.
  const sizes = kept.map((l) => Math.round(l.size * 2) / 2).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)] || 10;
  const gaps: number[] = [];
  for (let i = 1; i < kept.length; i++) {
    const a = kept[i - 1];
    const b = kept[i];
    if (a.page === b.page && Math.abs(a.size - b.size) < 0.6) {
      const g = a.y - b.y;
      if (g > 0 && g < body * 3) gaps.push(g);
    }
  }
  gaps.sort((a, b) => a - b);
  const lineGap = gaps[Math.floor(gaps.length / 2)] || body * 1.25;

  const blocks: Block[] = [];
  let buf = "";
  let bufType: Block["type"] = "p";
  let n = 0;
  const flush = () => {
    const text = undash(buf.replace(/\s+/g, " ").trim());
    if (text.length > 1) blocks.push({ id: `b${++n}`, type: bufType, runs: [{ text }] });
    buf = "";
    bufType = "p";
  };

  for (let i = 0; i < kept.length; i++) {
    const l = kept[i];
    const prev = kept[i - 1];
    const text = l.text.trim();
    const heading = l.size > body * 1.18 && text.length < 110;
    const type: Block["type"] = heading ? (l.size > body * 1.5 ? "h2" : "h3") : "p";

    let breakHere = !prev;
    if (prev) {
      const samePage = prev.page === l.page;
      const gap = prev.y - l.y;
      const endedSentence = /[.!?:"”)]\s*$/.test(prev.text.trim());
      if (type !== bufType) breakHere = true;
      else if (samePage && (gap > lineGap * 1.45 || gap < -lineGap)) breakHere = true;
      else if (samePage && endedSentence && l.x > prev.x + body * 0.9) breakHere = true; // indented first line
      else if (!samePage && endedSentence && /^[A-Z“"]/.test(text)) breakHere = true;
    }
    if (breakHere && buf) flush();
    bufType = type;
    if (buf.endsWith("-") && /^[a-z]/.test(text)) buf = buf.slice(0, -1) + text;
    else buf += (buf ? " " : "") + text;
  }
  flush();

  // Title: document metadata, then the first big line.
  let title = "";
  try {
    const meta = (await doc.getMetadata()) as { info?: { Title?: string; Author?: string } };
    title = meta.info?.Title?.trim() ?? "";
    if (/^(untitled|microsoft word|document\d*)/i.test(title) || title.length < 3) title = "";
  } catch {}
  if (!title && blocks[0] && blocks[0].type !== "p") title = blocks.shift()!.runs[0].text;
  if (!title) title = file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ");

  return {
    id: `${slugify(title)}-${Math.random().toString(36).slice(2, 7)}`,
    title: tidyTitle(undash(title)),
    source: `${file.name}${doc.numPages > MAX_PAGES ? `, first ${MAX_PAGES} pages` : ""}`,
    blocks,
    origin: "file",
    addedAt: Date.now(),
  };
}
