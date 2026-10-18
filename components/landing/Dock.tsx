"use client";

import Link from "next/link";
import { useRef, type CSSProperties, type ReactNode } from "react";
import { Library, Plus } from "lucide-react";

export type DockText = { id: string; title: string; byline: string; cover?: string; reading?: boolean };

const REACH = 140;
const GROW = 0.55;

/**
 * The Dock: the sample texts (and anything you are in the middle of), the
 * library, and "+" to open something new. Icons swell under the pointer.
 */
export function Dock({ texts, onOpen, onAdd }: { texts: DockText[]; onOpen: (id: string) => void; onAdd: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  const magnify = (x: number | null) => {
    const items = ref.current?.querySelectorAll<HTMLElement>("[data-dock-item]");
    if (!items) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    items.forEach((el) => {
      let s = 1;
      if (x !== null && !still) {
        const r = el.getBoundingClientRect();
        const d = Math.abs(x - (r.left + r.width / 2));
        s = 1 + GROW * Math.max(0, Math.cos(Math.min(1, d / REACH) * (Math.PI / 2)));
      }
      el.style.setProperty("--s", s.toFixed(3));
    });
  };

  return (
    <nav className="mg-dock-wrap" aria-label="Dock">
      <div ref={ref} className="mg-dock" onMouseMove={(e) => magnify(e.clientX)} onMouseLeave={() => magnify(null)}>
        {texts.map((t) => (
          <Item key={t.id} label={t.title} sub={t.byline} running={t.reading}>
            <button type="button" className="mg-dock-icon is-cover" onClick={() => onOpen(t.id)} aria-label={`Open ${t.title}`}>
              {t.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.cover} alt="" draggable={false} />
              ) : (
                <span className="mg-dock-letter">{t.title.trim().charAt(0).toUpperCase()}</span>
              )}
            </button>
          </Item>
        ))}
        <span className="mg-dock-sep" aria-hidden />
        <Item label="Library">
          <Link href="/library" className="mg-dock-icon is-glyph is-library" aria-label="Open your library">
            <Library size={26} strokeWidth={1.6} aria-hidden />
          </Link>
        </Item>
        <Item label="Open a link or PDF">
          <button type="button" className="mg-dock-icon is-glyph is-add" onClick={onAdd} aria-label="Open a link or a PDF">
            <Plus size={28} strokeWidth={1.6} aria-hidden />
          </button>
        </Item>
      </div>
    </nav>
  );
}

function Item({ label, sub, running, children }: { label: string; sub?: string; running?: boolean; children: ReactNode }) {
  return (
    <div className="mg-dock-item" data-dock-item style={{ "--s": 1 } as CSSProperties}>
      <span className="mg-dock-label" role="tooltip">
        {label}
        {sub && <small>{sub}</small>}
      </span>
      {children}
      {running && <span className="mg-dock-run" aria-label="In progress" />}
    </div>
  );
}
