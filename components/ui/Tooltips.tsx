"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Side = "top" | "bottom" | "left" | "right";
type Tip = { el: HTMLElement; label: string; hint?: string; kbd?: string; side: Side; tone: "ink" | "paper" };

const GAP = 8;
const EDGE = 8;

function read(el: HTMLElement): Tip {
  const d = el.dataset;
  const r = el.getBoundingClientRect();
  return {
    el,
    label: d.tip ?? "",
    hint: d.tipHint || undefined,
    kbd: d.tipKbd || undefined,
    side: (d.tipSide as Side) || (r.top < 96 ? "bottom" : "top"),
    tone: el.closest<HTMLElement>("[data-tip-tone]")?.dataset.tipTone === "paper" ? "paper" : "ink",
  };
}

/**
 * One tooltip for the whole app. Anything with data-tip gets it: instantly on
 * hover or keyboard focus, never on touch. Moving along a row of controls,
 * the tip slides from one to the next instead of blinking.
 * Optional: data-tip-hint (a second, quieter phrase), data-tip-kbd (a key),
 * data-tip-side, and data-tip-tone="paper" on a dark surface.
 */
export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [warm, setWarm] = useState(false);
  const [seq, setSeq] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<Tip | null>(null);
  tipRef.current = tip;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenAt = useRef(0);
  // After a click, the control under the pointer stays quiet until it is left.
  const muted = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const show = (el: HTMLElement) => {
      if (!el.dataset.tip || el.getAttribute("aria-expanded") === "true") return hide(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      const cur = tipRef.current;
      const isWarm = cur !== null || Date.now() - hiddenAt.current < 260;
      setWarm(isWarm);
      if (!isWarm) setSeq((n) => n + 1);
      setTip(read(el));
    };
    const hide = (now = false) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      const go = () => {
        if (tipRef.current) hiddenAt.current = Date.now();
        setTip(null);
      };
      if (now) go();
      else hideTimer.current = setTimeout(go, 60);
    };
    const tipped = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>("[data-tip]") : null);

    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = tipped(e.target);
      if (!el) return;
      if (el === muted.current) return tipRef.current && tipRef.current.el !== el ? hide(true) : undefined;
      if (el !== tipRef.current?.el) show(el);
    };
    const out = (e: PointerEvent) => {
      const m = muted.current;
      if (m && !(e.relatedTarget instanceof Node && m.contains(e.relatedTarget))) muted.current = null;
      const from = tipped(e.target);
      if (!from) return;
      const to = tipped(e.relatedTarget);
      if (to === from) return;
      if (!to) hide();
    };
    const down = (e: PointerEvent) => {
      const el = tipped(e.target);
      if (el) muted.current = el;
      hide(true);
    };
    const focusIn = (e: FocusEvent) => {
      const el = tipped(e.target);
      if (el && el.matches(":focus-visible")) show(el);
    };
    const focusOut = () => hide(true);
    const quiet = () => hide(true);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && tipRef.current) hide(true);
    };

    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", focusOut);
    document.addEventListener("keydown", key, true);
    window.addEventListener("scroll", quiet, { passive: true, capture: true });
    window.addEventListener("blur", quiet);
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("focusin", focusIn);
      document.removeEventListener("focusout", focusOut);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", quiet, { capture: true });
      window.removeEventListener("blur", quiet);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  // A control can unmount or change its label under the tip.
  useEffect(() => {
    if (!tip) return;
    const mo = new MutationObserver(() => {
      if (!tip.el.isConnected || !tip.el.dataset.tip) setTip(null);
      else if (tip.el.dataset.tip !== tip.label || tip.el.dataset.tipHint !== tip.hint) setTip(read(tip.el));
    });
    mo.observe(tip.el, { attributes: true, attributeFilter: ["data-tip", "data-tip-hint", "aria-expanded"] });
    const gone = setInterval(() => !tip.el.isConnected && setTip(null), 200);
    return () => {
      mo.disconnect();
      clearInterval(gone);
    };
  }, [tip]);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!tip || !box) return;
    const r = tip.el.getBoundingClientRect();
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let side = tip.side;
    if (side === "top" && r.top - h - GAP < EDGE) side = "bottom";
    else if (side === "bottom" && r.bottom + h + GAP > vh - EDGE) side = "top";
    let x = side === "left" ? r.left - w - GAP : side === "right" ? r.right + GAP : r.left + r.width / 2 - w / 2;
    let y = side === "top" ? r.top - h - GAP : side === "bottom" ? r.bottom + GAP : r.top + r.height / 2 - h / 2;
    x = Math.max(EDGE, Math.min(vw - w - EDGE, x));
    y = Math.max(EDGE, Math.min(vh - h - EDGE, y));
    box.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    box.dataset.side = side;
  }, [tip]);

  if (!tip) return null;
  return (
    <div ref={boxRef} className={`tip-box ${warm ? "is-warm" : ""}`} aria-hidden>
      <div key={seq} className={`tip tip-${tip.tone}`}>
        <span className="tip-main">
          <span className="font-medium">{tip.label}</span>
          {tip.kbd && <kbd className="tip-kbd">{tip.kbd}</kbd>}
        </span>
        {tip.hint && <span className="tip-hint">{tip.hint}</span>}
      </div>
    </div>
  );
}
