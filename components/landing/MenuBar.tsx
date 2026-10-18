"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Library } from "lucide-react";
import { Account } from "@/components/account/Account";
import { KeyMenu } from "@/components/ui/KeyMenu";
import { NAME } from "./name";

export type MenuAction = { label: string; kbd?: string; run?: () => void; href?: string; external?: boolean; disabled?: boolean } | "sep";
export type Menu = { label: string; items: MenuAction[]; bold?: boolean };

/** The clock in the corner, drawn only in the browser so the server and client agree. */
function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <span className="mg-clock" aria-hidden />;
  const day = now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const time = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return (
    <time className="mg-clock" dateTime={now.toISOString()}>
      {day}&nbsp;&nbsp;{time}
    </time>
  );
}

/**
 * The menu bar across the top of the desktop. The menus work: File opens
 * things, View opens the shelf, Help scrolls to how it works. On a phone it
 * shrinks to the name, the library and sign-in.
 */
export function MenuBar({ menus }: { menus: Menu[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(null);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <header className="mg-menubar">
      <div ref={ref} className="mg-menus" role="menubar" aria-label={`${NAME} menu`}>
        <span className="mg-apple" aria-hidden>
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path d="M3 2.5h7.5a2.5 2.5 0 0 1 2.5 2.5v8.5H5.5A2.5 2.5 0 0 1 3 11z" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10 2.5v11" stroke="currentColor" strokeWidth="1.4" />
            <path d="M5.5 6h2.5M5.5 8.5h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </span>
        {menus.map((m, i) => (
          <div key={m.label} className={`mg-menu${m.bold ? " is-app" : ""}`}>
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={open === i}
              className="mg-menu-btn"
              onClick={() => setOpen(open === i ? null : i)}
              onMouseEnter={() => open !== null && setOpen(i)}
            >
              {m.label}
            </button>
            {open === i && (
              <div role="menu" className="mg-menu-list">
                {m.items.map((it, j) =>
                  it === "sep" ? (
                    <hr key={j} />
                  ) : it.href ? (
                    <Link
                      key={j}
                      role="menuitem"
                      href={it.href}
                      className="mg-menu-item"
                      target={it.external ? "_blank" : undefined}
                      rel={it.external ? "noopener" : undefined}
                      onClick={() => setOpen(null)}
                    >
                      {it.label}
                      {it.kbd && <kbd>{it.kbd}</kbd>}
                    </Link>
                  ) : (
                    <button
                      key={j}
                      type="button"
                      role="menuitem"
                      className="mg-menu-item"
                      disabled={it.disabled}
                      onClick={() => {
                        setOpen(null);
                        it.run?.();
                      }}
                    >
                      {it.label}
                      {it.kbd && <kbd>{it.kbd}</kbd>}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        ))}
        <span className="mg-mobile-name">{NAME}</span>
      </div>
      <div className="mg-status">
        <Link href="/library" className="mg-status-btn" aria-label="Library">
          <Library size={15} aria-hidden />
          <span>Library</span>
        </Link>
        <span className="mg-status-slot">
          <KeyMenu />
        </span>
        <span className="mg-status-slot">
          <Account />
        </span>
        <Clock />
      </div>
    </header>
  );
}
