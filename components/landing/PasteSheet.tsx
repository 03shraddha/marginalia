"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

/** A macOS sheet for a page of text: paste it, then read it like any article. */
export function PasteSheet({ open, onClose, onRead }: { open: boolean; onClose: () => void; onRead: (text: string) => void }) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <div className="mg-scrim" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Paste text to read" className="mg-sheet" onClick={(e) => e.stopPropagation()}>
        <h2 className="mg-sheet-title">Paste something to read</h2>
        <p className="mg-sheet-sub">An article, a chapter or your notes. A short first line becomes the title.</p>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={10} aria-label="Text to read" className="mg-sheet-text" />
        <div className="mg-sheet-actions">
          <span className="mg-sheet-count">{words ? `${words.toLocaleString()} words` : ""}</span>
          <button type="button" className="mg-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="mg-btn is-primary" disabled={words < 20} onClick={() => onRead(text)}>
            Read this <ArrowRight size={15} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
