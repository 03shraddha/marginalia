"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { wordCount, type Article } from "@/lib/article";
import { importFromFile, importFromText, importFromUrl, keep, looksLikeUrl } from "@/lib/import";
import { hideSample, useLibraryPrefs } from "@/lib/library-prefs";
import { normalizeUrl } from "@/lib/links";
import { SAMPLES } from "@/lib/samples";
import { applySettings } from "@/lib/settings";
import { useStore } from "@/lib/store";
import { SAMPLE_SHELF } from "@/lib/classics";
import { tidyTitle } from "@/lib/article";
import { ArrowUpRight, Check } from "lucide-react";
import Link from "next/link";
import { Dock, type DockText } from "./Dock";
import { Editorial } from "./Editorial";
import { ImportBar, type Busy } from "./ImportBar";
import { ImportSheet } from "./ImportSheet";
import { DEMO, LiveDemo } from "./LiveDemo";
import { MenuBar, type Menu } from "./MenuBar";
import { NAME, SARVAM_URL } from "./name";
import { PasteSheet } from "./PasteSheet";
import { ShelfSheet, type ShelfItem } from "./ShelfSheet";

type Saved = { id: string; title: string };

/**
 * The landing: a Mac desktop on a watercolor wash. One window holds a live
 * paragraph to ask about; the Dock holds the samples and "+"; the toolbar
 * holds the address field. Below the fold, how it works. On a phone, the
 * same pieces as a stack of cards with the address field at the foot.
 */
export function Landing({ signedIn: signedInAtLoad = false }: { signedIn?: boolean }) {
  const router = useRouter();
  // Known on the server at load, so a signed-in reader never sees the demo flash; then live, for a sign-in from this page.
  const { isLoaded, isSignedIn } = useAuth();
  const signedIn = isLoaded ? Boolean(isSignedIn) : signedInAtLoad;
  const hydrate = useStore((s) => s.hydrate);
  const hydrated = useStore((s) => s.hydrated);
  const library = useStore((s) => s.library);
  const progress = useStore((s) => s.progress);
  const glosses = useStore((s) => s.glosses);
  const removeFromLibrary = useStore((s) => s.removeFromLibrary);
  const shelve = useStore((s) => s.shelve);
  const { hiddenSamples } = useLibraryPrefs();

  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorNeedsKey, setErrorNeedsKey] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
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
    (id: string, hl?: string) => {
      setLeaving(true);
      setTimeout(() => router.push(`/read/${id}${hl ? `?hl=${hl}` : ""}`), 240);
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
    async (raw: string, later = false) => {
      if (!raw.trim()) return;
      setError(null);
      setSaved(null);
      let host = raw.trim();
      try {
        host = new URL(/^https?:/i.test(host) ? host : `https://${host}`).hostname.replace(/^www\./, "");
      } catch {}
      setBusy({ label: `${later ? "Saving" : "Reading"} ${host}` });
      // A link to a PDF is read here in the browser, with its progress in the bar.
      const r = await importFromUrl(raw, (p, label) => setBusy({ label: label ?? `Reading ${host}`, pct: p }));
      if (!r.ok) {
        setError(r.error);
        setErrorNeedsKey(Boolean(r.needKey));
        setBusy(null);
        return;
      }
      if (!later) return finish(r.article, r.file);
      const err = await keep(r.article, r.file);
      setBusy(null);
      if (err) return setError(err);
      setUrl("");
      setSaved({ id: r.article.id, title: r.article.title });
    },
    [finish]
  );

  // A link handed in from elsewhere, by the bookmarklet or a share: /?url=… opens it, /?save=… shelves it for later.
  const handed = useRef(false);
  useEffect(() => {
    if (!hydrated || handed.current) return;
    handed.current = true;
    const q = new URLSearchParams(window.location.search);
    const later = q.has("save");
    const raw = (q.get("save") ?? q.get("url") ?? "").trim();
    if (!raw) return;
    // Off the address bar, so a reload or a shared screenshot does not import it again.
    window.history.replaceState(null, "", "/");
    if (!looksLikeUrl(raw)) return setError("That does not look like a link.");
    const known = useStore.getState().library.find((x) => x.sourceUrl && normalizeUrl(x.sourceUrl) === normalizeUrl(raw));
    if (known) return later ? setSaved({ id: known.id, title: known.title }) : go(known.id);
    setUrl(raw);
    void fromUrl(raw, later);
  }, [hydrated, fromUrl, go]);

  const fromFile = useCallback(
    async (f: File) => {
      setError(null);
      setErrorNeedsKey(false);
      setBusy({ label: `Opening ${f.name}`, pct: f.name.toLowerCase().endsWith(".pdf") ? 0 : undefined });
      // The PDF reader reports what it is doing: "Reading 12 pages", then any scanned ones.
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
        fromUrl(t);
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

  const items: ShelfItem[] = useMemo(() => {
    const p = (id: string) => (hydrated ? progress[id]?.pct ?? 0 : 0);
    const g = (id: string) => (hydrated ? (glosses[id] ?? []).length : 0);
    const mine = library.map((x) => ({
      id: x.id,
      title: x.title,
      byline: x.author || x.source || (x.origin === "paste" ? "Pasted text" : "Imported"),
      words: x.words,
      pct: p(x.id),
      glosses: g(x.id),
      sample: false,
      touched: (hydrated ? progress[x.id]?.at : 0) || x.addedAt,
    }));
    const samples = SAMPLES.filter((a) => !hiddenSamples.includes(a.id)).map((a) => ({
      id: a.id,
      title: a.title,
      byline: [a.author?.split(" ").slice(-1)[0], a.published].filter(Boolean).join(", "),
      dek: a.dek,
      words: wordCount(a),
      pct: p(a.id),
      glosses: g(a.id),
      sample: true,
      touched: hydrated ? progress[a.id]?.at ?? 0 : 0,
    }));
    // What you are in the middle of comes first, then whatever was touched last.
    const reading = (x: ShelfItem) => Number(x.pct > 0 && x.pct < 1);
    return [...mine, ...samples].sort((a, b) => reading(b) - reading(a) || b.touched - a.touched);
  }, [library, progress, glosses, hydrated, hiddenSamples]);

  // The Dock: what you are in the middle of first, then the samples.
  const dockTexts: DockText[] = useMemo(() => {
    const reading = items.filter((x) => !x.sample && x.pct > 0 && x.pct < 1).slice(0, 2);
    const samples = SAMPLES.filter((a) => !hiddenSamples.includes(a.id));
    return [
      ...reading.map((x) => ({ id: x.id, title: tidyTitle(x.title), byline: x.byline, reading: true })),
      ...samples.map((a) => {
        const pct = hydrated ? progress[a.id]?.pct ?? 0 : 0;
        return { id: a.id, title: tidyTitle(a.title), byline: [a.author, a.published].filter(Boolean).join(", "), cover: SAMPLE_SHELF[a.id]?.cover, reading: pct > 0 && pct < 1 };
      }),
    ];
  }, [items, hiddenSamples, hydrated, progress]);

  const current = useMemo(() => items.find((x) => x.pct > 0 && x.pct < 1) ?? null, [items]);
  const setUI = useStore((s) => s.setUI);
  const focusAddress = useCallback(() => inputRef.current?.focus(), []);
  const pickFile = useCallback(() => fileRef.current?.click(), []);
  const toHow = useCallback(() => document.getElementById("how")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), []);

  const menus: Menu[] = [
    {
      label: NAME,
      bold: true,
      items: [{ label: `About ${NAME}`, run: toHow }, "sep", { label: "Your Library", href: "/library" }, { label: "Sarvam AI", href: SARVAM_URL, external: true }],
    },
    {
      label: "File",
      items: [
        { label: "Open Link…", kbd: "/", run: focusAddress },
        { label: "Open PDF…", run: pickFile },
        { label: "Paste Text…", run: () => setPasteOpen(true) },
        "sep",
        { label: "Open Library", href: "/library" },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Paste a Link Anywhere", kbd: "⌘V", disabled: true },
        { label: "Ask About the Highlight", run: () => document.querySelector<HTMLElement>(".mg-sel")?.focus() },
      ],
    },
    {
      label: "View",
      items: [
        { label: "Shelf", kbd: "S", run: () => setUI({ shelf: "texts" }) },
        { label: "Highlights", run: () => setUI({ shelf: "highlights" }) },
      ],
    },
    { label: "Help", items: [{ label: "How It Works", run: toHow }, { label: "Read the Sample", href: `/read/${DEMO.id}` }] },
  ];

  const status = saved ? (
    <span className="mg-winstatus-note" key={saved.id}>
      <Check size={13} aria-hidden /> Saved {tidyTitle(saved.title)} to your library. <Link href="/library">Open</Link>
    </span>
  ) : current ? (
    <button type="button" className="mg-winstatus-note" onClick={() => go(current.id)}>
      Continue {tidyTitle(current.title)} · {Math.round(current.pct * 100)}%
    </button>
  ) : (
    <span className="mg-winstatus-note">{signedIn ? "Your highlights sync to every device." : "Highlights stay in this browser until you sign in."}</span>
  );

  return (
    <div className={`mg${leaving ? " is-leaving" : ""}`}>
      <Watercolor />

      <section className="mg-desktop" aria-label={`${NAME} desktop`}>
        <MenuBar menus={menus} />

        <h1 className="mg-mhead">
          Read anything with a scholar <em>in the margin.</em>
        </h1>

        <div className="mg-window" role="group" aria-label={`${DEMO.book}: ${DEMO.title}`}>
          <div className="mg-titlebar">
            <span className="mg-lights" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <p className="mg-wintitle">
              {DEMO.title} <span>· {DEMO.book}</span>
            </p>
          </div>
          <div className="mg-toolbar">
            <span className="mg-navbtns" aria-hidden>
              <svg viewBox="0 0 16 16" width="16" height="16">
                <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <svg viewBox="0 0 16 16" width="16" height="16">
                <path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <ImportBar
              ref={inputRef}
              url={url}
              setUrl={setUrl}
              busy={busy}
              error={error}
              errorNeedsKey={errorNeedsKey}
              onSubmit={fromUrl}
              onSave={(u) => fromUrl(u, true)}
              onPickFile={pickFile}
            />
            <button type="button" className="mg-toolbtn" onClick={() => setPasteOpen(true)}>
              Paste text
            </button>
          </div>
          <div className="mg-winbody">
            <LiveDemo />
          </div>
          <div className="mg-winstatus">
            {status}
            <span className="mg-winstatus-hint">
              Press <kbd>/</kbd> to paste a link, <kbd>S</kbd> for your shelf
            </span>
          </div>
        </div>

        <div className="mg-msamples">
          <p>Or open a classic</p>
          <ul>
            {dockTexts
              .filter((t) => t.cover)
              .map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => go(t.id)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.cover} alt="" draggable={false} />
                    <span>{t.title}</span>
                  </button>
                </li>
              ))}
          </ul>
          <Link href="/library" className="mg-textlink">
            Your library <ArrowUpRight size={14} aria-hidden />
          </Link>
        </div>

        <Dock texts={dockTexts} onOpen={(id) => go(id)} onAdd={() => setSheetOpen(true)} />
      </section>

      <Editorial />

      <ShelfSheet
        items={items}
        onOpen={go}
        onRename={(id, title) => shelve(id, { title })}
        onRemove={(it) => (it.sample ? hideSample(it.id) : removeFromLibrary(it.id))}
      />

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
      <ImportSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onUrl={(u) => fromUrl(u)} onPickFile={pickFile} onPasteText={() => setPasteOpen(true)} />
      <PasteSheet open={pasteOpen} onClose={() => setPasteOpen(false)} onRead={fromText} />

      {dragging && (
        <div className="mg-dropzone">
          <div>
            <p>Drop to read</p>
            <small>PDF, .txt or .md</small>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The wallpaper: washes of pink, peach, butter, sage and sky, their edges
 * roughened by turbulence, under a grain of paper. No image files.
 */
function Watercolor() {
  return (
    <div className="mg-wash" aria-hidden>
      <svg className="mg-wash-defs" width="0" height="0" focusable="false">
        <filter id="mg-bleed" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="4" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="90" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div className="mg-bloom">
        <i className="b1" />
        <i className="b2" />
        <i className="b3" />
        <i className="b4" />
        <i className="b5" />
        <i className="b6" />
      </div>
      <div className="mg-grain" />
    </div>
  );
}
