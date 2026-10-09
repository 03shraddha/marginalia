"use client";

import { textToArticle, wordCount, type Article } from "./article";
import { saveDoc, useStore } from "./store";

export type ImportResult = { ok: true; article: Article } | { ok: false; error: string };

export async function importFromUrl(raw: string): Promise<ImportResult> {
  try {
    const res = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: raw.trim() }) });
    const j = (await res.json()) as { article?: Article; error?: string };
    return j.article ? { ok: true, article: j.article } : { ok: false, error: j.error ?? "Could not import that page." };
  } catch {
    return { ok: false, error: "Could not reach the importer. Check your connection." };
  }
}

export async function importFromFile(file: File, onProgress?: (p: number) => void): Promise<ImportResult> {
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      const { pdfToArticle } = await import("./pdf");
      return { ok: true, article: await pdfToArticle(file, onProgress) };
    }
    if (/\.(txt|md|markdown|text)$/.test(name) || file.type.startsWith("text/")) {
      const a = textToArticle(await file.text(), { origin: "file" });
      if (a.title === "Untitled") a.title = file.name.replace(/\.(txt|md|markdown|text)$/i, "").replace(/[_-]+/g, " ");
      a.source = file.name;
      return { ok: true, article: a };
    }
    return { ok: false, error: "Gloss reads PDF, .txt and .md files." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read that file." };
  }
}

export function importFromText(text: string): ImportResult {
  const a = textToArticle(text, { origin: "paste" });
  return a.blocks.length ? { ok: true, article: a } : { ok: false, error: "There was no readable text in that." };
}

/** Saves an imported article and puts it on the shelf. */
export function keep(a: Article): string | null {
  if (!a.blocks.length) return "There was no readable text in that.";
  if (!saveDoc(a)) return "This browser's storage is full. Remove something from your shelf and try again.";
  useStore.getState().addToLibrary(a, wordCount(a));
  return null;
}

export const looksLikeUrl = (s: string) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(s.trim()) && !/\s/.test(s.trim());
