"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** A button that opens a small panel. Closes on outside click and Escape. */
export function Popover({
  label,
  trigger,
  children,
  align = "right",
  width = 300,
  triggerClass = "",
  tip,
  openOn,
  bare = false,
}: {
  label: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: number;
  triggerClass?: string;
  /** The trigger's tooltip; defaults to the label. */
  tip?: string;
  /** A window event that opens the panel from elsewhere on the page. */
  openOn?: string;
  /** No visible trigger: the panel opens only from the `openOn` event, beside where the trigger would be. */
  bare?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openOn) return;
    // On the next frame, so the click that sent the event does not count as an outside click.
    const show = () => requestAnimationFrame(() => setOpen(true));
    window.addEventListener(openOn, show);
    return () => window.removeEventListener(openOn, show);
  }, [openOn]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      // During a view transition the pointer lands on the root's snapshot, not on the page.
      if (e.target === document.documentElement && document.documentElement.classList.contains("theme-swap")) return;
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        data-tip={open ? undefined : tip ?? label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        tabIndex={bare ? -1 : undefined}
        className={bare ? "sr-only" : `${triggerClass} ${open ? "!bg-fill text-ink" : ""}`}
      >
        {trigger}
      </button>
      {open && (
        <>
          {/* Phones only: the dimmed page behind the sheet. A tap on it closes the sheet. */}
          <div aria-hidden className="sheet-scrim" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label={label}
            className={`pop is-menu absolute top-[calc(100%+8px)] z-[60] p-4 ${align === "right" ? "right-0" : "left-0"}`}
            style={{ width, ["--origin" as string]: align === "right" ? "top right" : "top left" }}
          >
            <div className="pop-grabber" aria-hidden>
              <span className="grabber" />
            </div>
            {children(() => setOpen(false))}
          </div>
        </>
      )}
    </div>
  );
}

/** Every nav control: same height, same center line, same hover. */
export const barBtn =
  "bar-btn inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-[8px] px-2 text-[13px] font-medium leading-none text-ink-2 transition-[background-color,color,transform] duration-150 hover:bg-fill hover:text-ink active:scale-[0.94]";
