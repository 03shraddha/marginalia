"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { tidyTitle, type Article } from "@/lib/article";
import { importFromFile, importFromText, importFromUrl, keep, looksLikeUrl } from "@/lib/import";
import { normalizeUrl } from "@/lib/links";
import { applySettings } from "@/lib/settings";
import { useStore } from "@/lib/store";
import { openKeyMenu } from "@/lib/ask";
import { KeyMenu } from "@/components/ui/KeyMenu";
import { GlossWordmark } from "@/components/brand/Gloss";
import { LiveDemo } from "./LiveDemo";
import { PasteSheet } from "./PasteSheet";
import { SAMPLE_HOST, SAMPLE_URL } from "./sample";

type Busy = null | { label: string; pct?: number };

/**
 * The landing: one line, one box for a link, one example link, and a small
 * live demo of a highlighted line and its answer in the margin.
 */
export function Landing() {
  const router = useRouter();
  const hydrate = useStore((s) => s.hydrate);
  const hydrated = useStore((s) => s.hydrated);
  const library = useStore((s) => s.library);
  const progress = useStore((s) => s.progress);

  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorNeedsKey, setErrorNeedsKey] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    hydrate();
    applySettings(useStore.getState().settings);
  }, [hydrate]);

  // Leave with a soft fade, so the page turns rather than cuts.
  const go = useCallback(
    (id: string) => {
      setLeaving(true);
      setTimeout(() => router.push(`/read/${id}`), 220);
    },
    [router]
  );

  const finish = useCallback(
    async (a: Article, file?: Blob) => {
      const err = await keep(a, file);
      if (err) {
        setError(err);
        setBusy(null);
        return;
      }
      go(a.id);
    },
    [go]
  );

  const fromUrl = useCallback(
    async (raw: string) => {
      if (!raw.trim()) return;
      setError(null);
      setErrorNeedsKey(false);
      // A link already in the library opens straight away.
      const known = useStore.getState().library.find((x) => x.sourceUrl && normalizeUrl(x.sourceUrl) === normalizeUrl(raw));
      if (known) return go(known.id);
      let host = raw.trim();
      try {
        host = new URL(/^https?:/i.test(host) ? host : `https://${host}`).hostname.replace(/^www\./, "");
      } catch {}
      setBusy({ label: `Reading ${host}` });
      // A link to a PDF is read here in the browser, with its progress in the bar.
      const r = await importFromUrl(raw, (p, label) => setBusy({ label: label ?? `Reading ${host}`, pct: p }));
      if (!r.ok) {
        setError(r.error);
        setErrorNeedsKey(Boolean(r.needKey));
        setBusy(null);
        return;
      }
      return finish(r.article, r.file);
    },
    [finish, go]
  );

  // A link handed in from elsewhere, by the bookmarklet or a share: /?url=… opens it.
  const handed = useRef(false);
  useEffect(() => {
    if (!hydrated || handed.current) return;
    handed.current = true;
    const q = new URLSearchParams(window.location.search);
    const raw = (q.get("url") ?? q.get("save") ?? "").trim();
    if (!raw) return;
    // Off the address bar, so a reload or a shared screenshot does not import it again.
    window.history.replaceState(null, "", "/");
    if (!looksLikeUrl(raw)) return setError("That does not look like a link.");
    setUrl(raw);
    void fromUrl(raw);
  }, [hydrated, fromUrl]);

  const fromFile = useCallback(
    async (f: File) => {
      setError(null);
      setErrorNeedsKey(false);
      setBusy({ label: `Opening ${f.name}`, pct: f.name.toLowerCase().endsWith(".pdf") ? 0 : undefined });
      const r = await importFromFile(f, (p, label) => setBusy({ label: label ?? `Reading ${f.name}`, pct: p }));
      if (r.ok) finish(r.article, r.file);
      else {
        setError(r.error);
        setErrorNeedsKey(Boolean(r.needKey));
        setBusy(null);
      }
    },
    [finish]
  );

  const fromText = useCallback(
    (text: string) => {
      const r = importFromText(text);
      setPasteOpen(false);
      if (r.ok) finish(r.article);
      else setError(r.error);
    },
    [finish]
  );

  // Paste a link or a page of text anywhere. Drop a file anywhere. Slash to type.
  useEffect(() => {
    const inField = (t: EventTarget | null) => (t as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]");
    const onPaste = (e: ClipboardEvent) => {
      if (inField(e.target) || busy) return;
      const t = e.clipboardData?.getData("text") ?? "";
      if (looksLikeUrl(t)) {
        e.preventDefault();
        setUrl(t.trim());
        void fromUrl(t);
      } else if (t.trim().split(/\s+/).length >= 40) {
        e.preventDefault();
        fromText(t);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (inField(e.target) || e.metaKey || e.ctrlKey) return;
      if (e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current++;
      setDragging(true);
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const leave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) fromFile(f);
    };
    document.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      document.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [busy, fromUrl, fromFile, fromText]);

  // What you are in the middle of, for a quiet way back.
  const current = useMemo(() => {
    if (!hydrated) return null;
    const mid = library
      .map((x) => ({ x, p: progress[x.id] }))
      .filter(({ p }) => p && p.pct > 0 && p.pct < 1)
      .sort((a, b) => (b.p?.at ?? 0) - (a.p?.at ?? 0))[0];
    return mid ? { id: mid.x.id, title: tidyTitle(mid.x.title), pct: Math.round((mid.p?.pct ?? 0) * 100) } : null;
  }, [library, progress, hydrated]);

  return (
    <div className={`lp${leaving ? " is-leaving" : ""}`}>
      <header className="lp-top">
        <Link href="/" aria-label="Marginalia" className="lp-brand">
          <GlossWordmark />
        </Link>
        <nav aria-label="Main" className="lp-nav">
          <KeyMenu />
        </nav>
      </header>

      <main className="lp-main">
        <section className="lp-hero" aria-label="Open something to read">
          <h1 className="lp-h1">
            Read anything with a scholar <span className="lp-hl">in the margin.</span>
          </h1>

          <form
            className={`lp-form${busy ? " is-busy" : ""}`}
            onSubmit={(e) => {
              e.preventDefault();
              void fromUrl(url);
            }}
          >
            <input
              ref={inputRef}
              value={busy ? busy.label + (busy.pct !== undefined ? ` ${Math.round(busy.pct * 100)}%` : "") : url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={!!busy}
              placeholder="Paste a link to read"
              aria-label="Link to read"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" disabled={!!busy || !url.trim()} aria-label="Read">
              Read <ArrowRight size={14} aria-hidden />
            </button>
            {busy && <span aria-hidden className="lp-progress" style={busy.pct !== undefined ? { ["--p" as string]: busy.pct } : undefined} />}
          </form>

          {error && (
            <p className="lp-error" role="alert">
              {error}
              {errorNeedsKey && (
                <>
                  {" "}
                  <button type="button" className="lp-link" onClick={openKeyMenu}>
                    Add your API key
                  </button>
                </>
              )}
            </p>
          )}

          <p className="lp-try">
            <span>Try</span>
            <button type="button" className="lp-chip" onClick={() => void fromUrl(SAMPLE_URL)} disabled={!!busy} title={SAMPLE_URL}>
              {SAMPLE_HOST}
            </button>
          </p>

          {current && (
            <p className="lp-continue">
              <button type="button" className="lp-link" onClick={() => go(current.id)}>
                Continue {current.title} · {current.pct}%
              </button>
            </p>
          )}
        </section>

        <section aria-label="How it works" className="lp-demo-wrap">
          <LiveDemo />
        </section>
      </main>

      <footer className="lp-foot">
        <span>Answers cite the paragraph they come from.</span>
        <span className="lp-foot-links">
          <button type="button" onClick={() => setPasteOpen(true)}>
            Paste text
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            Open a PDF
          </button>
        </span>
      </footer>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) fromFile(f);
          e.target.value = "";
        }}
      />
      <PasteSheet open={pasteOpen} onClose={() => setPasteOpen(false)} onRead={fromText} />

      {dragging && (
        <div className="lp-dropzone">
          <p>Drop to read</p>
        </div>
      )}
    </div>
  );
}
