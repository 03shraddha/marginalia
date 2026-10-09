"use client";

import { create } from "zustand";
import type { Action } from "./actions";
import type { Article, BriefData } from "./article";
import type { ModelKey, Usage } from "./models";
import { DEFAULT_SETTINGS, SETTINGS_KEY, type Marker, type Settings } from "./settings";

/** A point in the text: block id and a character offset into its plain text. */
export type Point = { b: string; o: number };
export type Anchor = { start: Point; end: Point; quote: string };

export type Turn = {
  role: "user" | "assistant";
  content: string;
  usage?: Usage;
  model?: string;
  modelKey?: ModelKey;
  mode?: "live" | "demo";
  error?: string;
  streaming?: boolean;
};

export type Gloss = {
  id: string;
  articleId: string;
  /** Anchored to a selection... */
  anchor?: Anchor;
  /** ...or asked about the whole text from a reading position (a block id). */
  at?: string;
  action: Action;
  question?: string;
  turns: Turn[];
  createdAt: number;
};

export type Highlight = { id: string; articleId: string; anchor: Anchor; createdAt: number; color?: Marker };

export type BriefState =
  | { status: "loading" }
  | { status: "ready"; data: BriefData; usage?: Usage; modelKey?: ModelKey; at: number }
  | { status: "error"; error: string; demo?: boolean };

export type { Settings } from "./settings";

export type LibraryItem = {
  id: string;
  title: string;
  author?: string;
  source?: string;
  words: number;
  origin: Article["origin"];
  addedAt: number;
};

export type Progress = { block: string; pct: number; at: number };

type Persisted = {
  glosses: Record<string, Gloss[]>;
  highlights: Record<string, Highlight[]>;
  briefs: Record<string, BriefState>;
  progress: Record<string, Progress>;
  library: LibraryItem[];
};

type UI = {
  hydrated: boolean;
  activeGloss: string | null;
  hoverGloss: string | null;
  enteringGloss: string | null;
  activeHighlight: string | null;
  /** Just created: its mark is drawn on rather than appearing. */
  enteringHighlight: string | null;
  notebookOpen: boolean;
  shortcutsOpen: boolean;
  focusMode: boolean;
  cursor: string | null;
  briefOpen: boolean;
  /** The passage a question is being typed about, shown while the native selection is gone. */
  pending: Anchor | null;
};

type State = Persisted &
  UI & {
    settings: Settings;
    hydrate: () => void;
    setSettings: (s: Partial<Settings>) => void;
    setUI: (u: Partial<UI>) => void;
    addGloss: (g: Gloss) => void;
    updateGloss: (articleId: string, id: string, fn: (g: Gloss) => Gloss) => void;
    removeGloss: (articleId: string, id: string) => void;
    addHighlight: (h: Highlight) => void;
    updateHighlight: (articleId: string, id: string, patch: Partial<Highlight>) => void;
    removeHighlight: (articleId: string, id: string) => void;
    setBrief: (articleId: string, b: BriefState | null) => void;
    setProgress: (articleId: string, p: Progress) => void;
    addToLibrary: (a: Article, words: number) => void;
    removeFromLibrary: (id: string) => void;
  };

const KEY = "gloss:v1";
const DOC_PREFIX = "gloss:doc:";


export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const useStore = create<State>((set, get) => ({
  glosses: {},
  highlights: {},
  briefs: {},
  progress: {},
  library: [],
  settings: DEFAULT_SETTINGS,
  hydrated: false,
  activeGloss: null,
  hoverGloss: null,
  enteringGloss: null,
  activeHighlight: null,
  enteringHighlight: null,
  notebookOpen: false,
  shortcutsOpen: false,
  focusMode: false,
  cursor: null,
  briefOpen: true,
  pending: null,

  hydrate: () => {
    if (get().hydrated) return;
    let data: Partial<Persisted> = {};
    let settings: Partial<Settings> = {};
    try {
      data = JSON.parse(localStorage.getItem(KEY) || "{}");
      settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    } catch {}
    // A reload mid-answer leaves a dangling stream: mark it, never spin forever.
    const glosses = data.glosses ?? {};
    for (const list of Object.values(glosses)) {
      for (const g of list) {
        for (const t of g.turns) {
          if (t.streaming) {
            t.streaming = false;
            if (!t.content) t.error = "Interrupted. Ask again to retry.";
          }
        }
      }
    }
    const briefs = data.briefs ?? {};
    for (const [k, b] of Object.entries(briefs)) if (b.status !== "ready") delete briefs[k];
    set({
      glosses,
      highlights: data.highlights ?? {},
      briefs,
      progress: data.progress ?? {},
      library: data.library ?? [],
      settings: { ...DEFAULT_SETTINGS, ...settings },
      hydrated: true,
    });
  },

  setSettings: (s) => {
    const settings = { ...get().settings, ...s };
    set({ settings });
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  },

  setUI: (u) => set(u),

  addGloss: (g) =>
    set((st) => ({
      glosses: { ...st.glosses, [g.articleId]: [...(st.glosses[g.articleId] ?? []), g] },
      activeGloss: g.id,
      enteringGloss: g.id,
    })),

  updateGloss: (articleId, id, fn) =>
    set((st) => ({
      glosses: { ...st.glosses, [articleId]: (st.glosses[articleId] ?? []).map((g) => (g.id === id ? fn(g) : g)) },
    })),

  removeGloss: (articleId, id) =>
    set((st) => ({
      glosses: { ...st.glosses, [articleId]: (st.glosses[articleId] ?? []).filter((g) => g.id !== id) },
      activeGloss: st.activeGloss === id ? null : st.activeGloss,
      hoverGloss: st.hoverGloss === id ? null : st.hoverGloss,
    })),

  addHighlight: (h) => {
    set((st) => ({ highlights: { ...st.highlights, [h.articleId]: [...(st.highlights[h.articleId] ?? []), h] }, enteringHighlight: h.id }));
    setTimeout(() => get().enteringHighlight === h.id && set({ enteringHighlight: null }), 700);
  },

  updateHighlight: (articleId, id, patch) =>
    set((st) => ({
      highlights: { ...st.highlights, [articleId]: (st.highlights[articleId] ?? []).map((h) => (h.id === id ? { ...h, ...patch } : h)) },
    })),

  removeHighlight: (articleId, id) =>
    set((st) => ({
      highlights: { ...st.highlights, [articleId]: (st.highlights[articleId] ?? []).filter((h) => h.id !== id) },
      activeHighlight: st.activeHighlight === id ? null : st.activeHighlight,
    })),

  setBrief: (articleId, b) =>
    set((st) => {
      const briefs = { ...st.briefs };
      if (b) briefs[articleId] = b;
      else delete briefs[articleId];
      return { briefs };
    }),

  setProgress: (articleId, p) => set((st) => ({ progress: { ...st.progress, [articleId]: p } })),

  addToLibrary: (a, words) =>
    set((st) => ({
      library: [
        { id: a.id, title: a.title, author: a.author, source: a.source, words, origin: a.origin, addedAt: a.addedAt ?? Date.now() },
        ...st.library.filter((x) => x.id !== a.id),
      ],
    })),

  removeFromLibrary: (id) => {
    try {
      localStorage.removeItem(DOC_PREFIX + id);
    } catch {}
    set((st) => ({ library: st.library.filter((x) => x.id !== id) }));
  },
}));

/* Debounced persistence. Streaming updates land many times a second, so the
   write waits for a pause rather than serializing on every token. */
if (typeof window !== "undefined") {
  let t: ReturnType<typeof setTimeout> | null = null;
  useStore.subscribe((st, prev) => {
    if (!st.hydrated) return;
    if (
      st.glosses === prev.glosses &&
      st.highlights === prev.highlights &&
      st.briefs === prev.briefs &&
      st.progress === prev.progress &&
      st.library === prev.library
    )
      return;
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      const { glosses, highlights, briefs, progress, library } = useStore.getState();
      try {
        localStorage.setItem(KEY, JSON.stringify({ glosses, highlights, briefs, progress, library }));
      } catch {}
    }, 400);
  });
}

export function saveDoc(a: Article) {
  try {
    localStorage.setItem(DOC_PREFIX + a.id, JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function loadDoc(id: string): Article | null {
  try {
    const raw = localStorage.getItem(DOC_PREFIX + id);
    return raw ? (JSON.parse(raw) as Article) : null;
  } catch {
    return null;
  }
}

const EMPTY: never[] = [];
export const useGlosses = (articleId: string) => useStore((s) => s.glosses[articleId] ?? EMPTY);
export const useHighlights = (articleId: string) => useStore((s) => s.highlights[articleId] ?? EMPTY);
