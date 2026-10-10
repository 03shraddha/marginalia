"use client";

import { useLayoutEffect, useMemo, useRef, useState, ViewTransition } from "react";
import { fmtMinutes, groupOf, lookOf, type Book, type Sort, type TagKey, type TopicKey } from "@/lib/library";
import { Glyph, Spine } from "./Book";

const PAD = 28;
const GAP = 3;
const GROUP_GAP = 38;
const AREA = 268; // the space a book stands in
const PLANK = 16;
const PITCH = AREA + PLANK + 52;

/** Fetch a book's picture as it is reached for, so its cover is there when it comes off the shelf. */
const warm = (b: Book) => {
  const src = b.cover?.startsWith("/") ? b.cover : b.image;
  if (src) new Image().src = src;
};

type Pos = { x: number; y: number; row: number };

/** About how wide a shelf label is: its words, its icon, its count, its padding. */
const labelWidth = (l: { label: string; icon?: string; count: number }) => l.label.length * 6.6 + (l.icon ? 22 : 0) + 30;

/**
 * Where every book stands: left to right along a plank, a gap between runs
 * of a topic (or a decade, or a length), a new shelf when one is full. The
 * books are placed absolutely, so a new sort or filter slides each one to
 * its new spot instead of re-flowing.
 */
function shelve(books: Book[], width: number, sort: Sort) {
  const pos = new Map<string, Pos>();
  const labels: { key: string; label: string; icon?: TopicKey | TagKey; x: number; row: number; count: number }[] = [];
  const ends: number[] = [];
  let x = PAD, row = 0, group = "";
  const inner = Math.max(200, width);
  for (const b of books) {
    const { w, h } = lookOf(b);
    const g = groupOf(b, sort);
    const fresh = g && g.key !== group;
    if (fresh && x > PAD) {
      x += GROUP_GAP;
      // Room for the previous run's label, when the run itself is narrower than its label.
      const prev = labels[labels.length - 1];
      if (prev && prev.row === row) x = Math.max(x, prev.x + labelWidth(prev) + 12);
    }
    if (x + w > inner - PAD && x > PAD) {
      ends[row] = x;
      row++;
      x = PAD;
    }
    pos.set(b.id, { x, y: row * PITCH + AREA - h, row });
    if (fresh) labels.push({ key: g.key, label: g.label, icon: g.icon, x, row, count: 0 });
    if (g) labels[labels.length - 1].count++;
    group = g?.key ?? "";
    x += w + GAP;
  }
  ends[row] = x;
  return { pos, labels, rows: row + 1, ends };
}

export function Shelf({
  books,
  shown,
  sort,
  openId,
  fresh,
  onOpen,
  onLabel,
}: {
  /** Every book that could be on the shelf, in order. */
  books: Book[];
  /** The ids that pass the filter. */
  shown: Set<string>;
  sort: Sort;
  openId: string | null;
  /** Books just added, here or by an agent: they drop in. */
  fresh: Set<string>;
  onOpen: (b: Book, el: HTMLElement) => void;
  /** A shelf label, clicked: that topic's own page. */
  onLabel?: (key: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [entering, setEntering] = useState(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    const t = setTimeout(() => setEntering(false), 1800);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, []);

  const visible = useMemo(() => books.filter((b) => shown.has(b.id)), [books, shown]);
  const { pos, labels, rows, ends } = useMemo(() => shelve(visible, width, sort), [visible, width, sort]);

  // A book taken off the shelf stays where it last stood while it fades; one
  // coming back appears at its new place without sliding across the room.
  const last = useRef(new Map<string, Pos>());
  const wasOut = useRef(new Set<string>());
  const placed = books.map((b) => {
    const p = pos.get(b.id);
    const out = !p;
    const at = p ?? last.current.get(b.id) ?? { x: PAD, y: AREA - lookOf(b).h, row: 0 };
    const jump = !out && (wasOut.current.has(b.id) || !last.current.has(b.id));
    return { b, at, out, jump };
  });
  useLayoutEffect(() => {
    for (const p of placed) if (!p.out) last.current.set(p.b.id, p.at);
    wasOut.current = new Set(placed.filter((p) => p.out).map((p) => p.b.id));
  });

  // Order of first appearance, for the stagger when the shelf fills.
  const order = new Map(visible.map((b, i) => [b.id, i]));

  // Arrow keys walk along the shelf.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const btns = visible.map((b) => ref.current?.querySelector<HTMLElement>(`[data-book="${b.id}"]`)).filter(Boolean) as HTMLElement[];
    const i = btns.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    btns[Math.max(0, Math.min(btns.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)))]?.focus();
  };

  const lastRow = rows - 1;
  const free = width - PAD - (ends[lastRow] ?? PAD);

  return (
    <div ref={ref} className={`bookcase ${entering ? "is-entering" : ""}`} style={{ height: rows * PITCH - 20 }} onKeyDown={onKeyDown}>
      {Array.from({ length: Math.max(rows, 1) }, (_, r) => (
        <div key={r} className="plank" style={{ transform: `translateY(${r * PITCH + AREA}px)`, ["--i" as string]: r }} aria-hidden />
      ))}

      {labels.map((l) => {
        const style = { transform: `translate(${l.x}px, ${l.row * PITCH + AREA + PLANK + 10}px)` };
        const body = (
          <>
            {l.icon && <Glyph k={l.icon} size={16} className="mr-1" />}
            {l.label}
            <span className="ml-1.5 tabular-nums text-ink-4">{l.count}</span>
          </>
        );
        return onLabel ? (
          <button key={`${sort}-${l.key}`} type="button" className="plank-label" style={style} onClick={() => onLabel(l.key)} data-tip={`Open ${l.label}`}>
            {body}
          </button>
        ) : (
          <div key={`${sort}-${l.key}`} className="plank-label" style={style} aria-hidden>
            {body}
          </div>
        );
      })}

      {/* A bookend at the end of every shelf, and something growing on the last. */}
      {Array.from({ length: rows }, (_, r) => (
        <div key={`end-${r}`} className="bookend" style={{ transform: `translate(${(ends[r] ?? PAD) + 2}px, ${r * PITCH + AREA - 64}px)` }} aria-hidden>
          <svg viewBox="0 0 30 64" width="30" height="64">
            <defs>
              <linearGradient id="bookend-shade" x1="0" x2="1">
                <stop offset="0" stopColor="#fff" stopOpacity=".22" />
                <stop offset=".5" stopColor="#fff" stopOpacity="0" />
                <stop offset="1" stopColor="#000" stopOpacity=".18" />
              </linearGradient>
            </defs>
            <path d="M3 64V24C3 12 11 3 23 3h3v61z" fill="currentColor" />
            <path d="M3 64V24C3 12 11 3 23 3h3v61z" fill="url(#bookend-shade)" />
          </svg>
        </div>
      ))}
      <div className="shelf-plant" data-hidden={free < 140 || undefined} style={{ transform: `translate(${width - PAD - 92}px, ${lastRow * PITCH + AREA - 132}px)` }} aria-hidden>
        <Plant />
      </div>
      <div className="shelf-pile" data-hidden={free < 330 || undefined} style={{ transform: `translate(${width - PAD - 92 - 170}px, ${lastRow * PITCH + AREA - 46}px)` }} aria-hidden>
        <span style={{ background: "#3b2f6e", width: 146, marginLeft: 8 }} />
        <span style={{ background: "#e5c97a", width: 136, marginLeft: 0 }} />
        <span style={{ background: "#a43848", width: 156, marginLeft: 3 }} />
      </div>

      {width > 0 && placed.map(({ b, at, out, jump }) => {
        const look = lookOf(b);
        const i = order.get(b.id) ?? 0;
        return (
          <div
            key={b.id}
            className="bk-x"
            data-jump={jump || undefined}
            style={{ transform: `translateX(${at.x}px)`, transitionDelay: jump ? "0ms" : `${Math.min(i, 40) * 9}ms` }}
          >
            <div className="bk-y" data-jump={jump || undefined} style={{ transform: `translateY(${at.y}px)`, transitionDelay: jump ? "0ms" : `${Math.min(i, 40) * 9}ms` }}>
              <div
                className="bk-in"
                data-out={out || undefined}
                data-fresh={fresh.has(b.id) || undefined}
                style={{ ["--i" as string]: i, transitionDelay: out ? "0ms" : `${80 + Math.min(i, 30) * 14}ms` }}
              >
                <button
                  type="button"
                  data-book={b.id}
                  className="bk"
                  data-open={openId === b.id || undefined}
                  tabIndex={out ? -1 : 0}
                  aria-hidden={out || undefined}
                  aria-label={`${b.title}, ${b.author}`}
                  data-tip={b.title}
                  data-tip-hint={`${b.author} · ${fmtMinutes(b.minutes)}${b.pct > 0 && b.pct < 1 ? ` · ${Math.round(b.pct * 100)}% read` : b.pct >= 1 ? " · read" : ""}`}
                  onClick={(e) => onOpen(b, e.currentTarget.querySelector(".spine") as HTMLElement)}
                  onPointerEnter={() => warm(b)}
                  onFocus={() => warm(b)}
                >
                  <ViewTransition name={`book-${b.id}`} share="lib-morph" default="none">
                    <Spine book={b} look={look} />
                  </ViewTransition>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Plant() {
  return (
    <svg viewBox="0 0 92 132" width="92" height="132">
      <g className="plant-leaves">
        <path d="M46 84C44 60 30 44 12 40c4 20 16 36 34 44z" fill="#5f8a55" />
        <path d="M46 84c2-26 14-46 34-52-2 24-14 42-34 52z" fill="#4b7444" />
        <path d="M46 86C40 56 44 26 58 6c8 26 2 56-12 80z" fill="#6f9b62" />
        <path d="M46 86C36 66 22 60 6 64c10 14 24 22 40 22z" fill="#55804c" />
        <path d="M46 86c10-16 26-22 42-18-8 14-24 20-42 18z" fill="#6a9560" />
      </g>
      <path d="M22 84h48l-6 46H28z" fill="#c4704b" />
      <path d="M19 80h54v9H19z" fill="#d4825c" />
      <path d="M28 130h36" stroke="rgb(0 0 0 / .18)" strokeWidth="2" />
    </svg>
  );
}
