"use client";

import { useEffect, useRef, useState } from "react";
import { GlossWordmark } from "@/components/brand/Gloss";
import { KeyMenu } from "@/components/ui/KeyMenu";
import { SettingsMenu } from "@/components/ui/SettingsMenu";
import { useStore } from "@/lib/store";
import Link from "next/link";
import { MoreMenu } from "./MoreMenu";
import { useReader } from "./context";

export function TopBar({ currentN, pastTitle, listenFrom }: { currentN: number | null; pastTitle: boolean; listenFrom: () => string | null }) {
  const { ix, jumpTo } = useReader();
  const [hidden, setHidden] = useState(false);
  const [scrolledUp, setScrolledUp] = useState(false);
  const [peek, setPeek] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const focusMode = useStore((s) => s.focusMode);
  const barRef = useRef<HTMLSpanElement>(null);
  const notebookOpen = useStore((s) => s.notebookOpen);
  const brief = useStore((s) => s.briefs[ix.article.id]);

  // Tuck away while reading down, come back the moment the reader scrolls up.
  // The progress hairline is written straight to the DOM: no re-render per frame.
  useEffect(() => {
    let last = window.scrollY;
    const on = () => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (barRef.current) barRef.current.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
      setScrolled(y > 8);
      if (Math.abs(y - last) < 6) return;
      setHidden(y > last && y > 240);
      setScrolledUp(y < last);
      last = y;
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);

  // In focus mode the bar stays away until the pointer touches the top edge,
  // and leaves again once it moves down past the bar. Touch: scroll up.
  useEffect(() => {
    if (!focusMode) return;
    setPeek(false);
    setScrolledUp(false);
    const move = (e: PointerEvent) => {
      if (e.pointerType === "mouse") setPeek((p) => e.clientY < (p ? 96 : 12));
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [focusMode]);

  // The key menu lives in this bar: when an answer asks for a key, come back into view.
  useEffect(() => {
    const show = () => {
      setHidden(false);
      setPeek(true);
    };
    window.addEventListener("gloss:key", show);
    return () => window.removeEventListener("gloss:key", show);
  }, []);

  const tucked = focusMode ? !peek && !scrolledUp && !notebookOpen : hidden && !notebookOpen;

  const section = (() => {
    if (brief?.status !== "ready" || currentN === null) return null;
    let s: { title: string; start: number } | null = null;
    for (const x of brief.data.sections) if (x.start <= currentN) s = x;
    return s;
  })();

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 h-[var(--topbar-h)] transition-[transform,background-color,border-color] duration-300 ease-[var(--ease-out)] ${
        tucked ? "-translate-y-full" : ""
      } ${scrolled ? "vibrancy" : ""}`}
    >
      <div className="mx-auto flex h-full max-w-[1440px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Marginalia, back to the start" className="rounded-md">
          <GlossWordmark />
        </Link>

        {/* Always a spacer; the running title shows in it from tablet width up. */}
        <div className={`flex min-w-0 flex-1 justify-center transition-opacity duration-300 ${pastTitle ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <div className="hidden h-9 min-w-0 max-w-[560px] items-center gap-2 text-[13.5px] md:flex">
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="min-w-0 truncate rounded-[8px] px-2.5 py-1.5 text-[13.5px] font-semibold leading-none text-ink transition-colors hover:bg-fill"
              data-tip="Back to the top"
            >
              {ix.article.title}
            </button>
            {section && (
              <>
                <span className="h-3.5 w-[0.5px] shrink-0 bg-rule-strong" aria-hidden />
                <button
                  type="button"
                  onClick={() => jumpTo(section.start, { flash: false })}
                  data-tip="Go to the start of this part"
                  className="min-w-0 truncate rounded-[8px] px-2 py-1.5 leading-none text-ink-3 hover:bg-fill hover:text-ink"
                >
                  {section.title}
                </button>
              </>
            )}
          </div>
        </div>

        <nav aria-label="Reader tools" className="flex items-center gap-0.5">
          <KeyMenu />
          <SettingsMenu bare />
          <MoreMenu listenFrom={listenFrom} />
        </nav>
      </div>
      <span ref={barRef} aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-accent opacity-90" style={{ transform: "scaleX(0)" }} />
    </header>
  );
}
