"use client";

import { textToArticle, wordCount, type Article } from "./article";
import { shelveText } from "./shelving";
import { savePdf, saveDoc, useStore, type LibraryItem } from "./store";

/** `needKey`: the import needs the reader's own Together key (a long PDF, or free use spent). `file`: the original, kept with a PDF. */
export type ImportResult = { ok: true; article: Article; file?: Blob } | { ok: false; error: string; needKey?: boolean };

/** A link to a PDF is fetched by the server and read here, as if the file had been dropped. */
export async function importFromUrl(raw: string, onProgress?: (p: number, label?: string) => void): Promise<ImportResult> {
  try {
    const res = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: raw.trim(), pdf: true }) });
    if (res.ok && res.headers.get("content-type")?.includes("application/pdf")) {
      const name = decodeURIComponent(res.headers.get("x-file-name") ?? "document.pdf");
      const r = await importFromFile(new File([await res.blob()], name, { type: "application/pdf" }), onProgress);
      if (r.ok) r.article.sourceUrl ??= raw.trim();
      return r;
    }
    // A gateway timeout or crash answers with a web page, not JSON: that is the importer failing, not the reader's network.
    const j = (await res.json().catch(() => ({}))) as { article?: Article; error?: string };
    return j.article ? { ok: true, article: j.article } : { ok: false, error: j.error ?? "The importer did not answer. Try again, or use Paste text." };
  } catch {
    return { ok: false, error: "Could not reach the importer. Check your connection." };
  }
}

export async function importFromFile(file: File, onProgress?: (p: number, label?: string) => void): Promise<ImportResult> {
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      const { pdfToArticle, PdfError } = await import("./pdf");
      try {
        return { ok: true, article: await pdfToArticle(file, onProgress), file };
      } catch (e) {
        if (e instanceof PdfError) return { ok: false, error: e.message, needKey: e.needKey };
        throw e;
      }
    }
    if (/\.(txt|md|markdown|text)$/.test(name) || file.type.startsWith("text/")) {
      const a = textToArticle(await file.text(), { origin: "file" });
      if (a.title === "Untitled") a.title = file.name.replace(/\.(txt|md|markdown|text)$/i, "").replace(/[_-]+/g, " ");
      a.source = file.name;
      return { ok: true, article: a };
    }
    return { ok: false, error: "Marginalia reads PDF, .txt and .md files." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read that file." };
  }
}

export function importFromText(text: string): ImportResult {
  const a = textToArticle(text, { origin: "paste" });
  return a.blocks.length ? { ok: true, article: a } : { ok: false, error: "There was no readable text in that." };
}

/**
 * Saves an imported article (and a PDF's original file) and puts it on the
 * shelf; then, in the background, the library sorts it onto a topic.
 * `extra`: shelf fields known already, like a starter classic's topic and cover.
 */
export async function keep(a: Article, file?: Blob, extra?: Partial<LibraryItem>): Promise<string | null> {
  if (!a.blocks.length) return "There was no readable text in that.";
  if (!(await saveDoc(a))) return "This browser's storage is full. Remove something from your shelf and try again.";
  // The original is a nicety for reading it again; the text is what matters, so a failure here is quiet.
  if (file) await savePdf(a.id, file);
  useStore.getState().addToLibrary(a, wordCount(a), extra);
  if (!extra?.topic) void shelveText(a);
  return null;
}

/** One link with nothing else: a bare web address, or one in <angle brackets> or quotes. A port is fine; spaces are not. */
export const looksLikeUrl = (s: string) => {
  const t = s.trim().replace(/^[<"'\u201C\u2018]+|[>"'\u201D\u2019]+$/g, "");
  return /^(https?:\/\/)?[\p{L}\p{N}_-]+(\.[\p{L}\p{N}_-]+)+(:\d+)?([/?#]\S*)?$/iu.test(t) && !/\s/.test(t);
};
