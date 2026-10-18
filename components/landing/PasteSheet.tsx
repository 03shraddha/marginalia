"use client";

import { useEffect, useState } from "react";

/** A small dialog for a page of text: paste it, then read it like any article. */
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
    <div className="lp-scrim" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Paste text to read" className="lp-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Paste something to read</h2>
        <p>An article, a chapter or your notes. A short first line becomes the title.</p>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={9} aria-label="Text to read" />
        <div className="lp-sheet-actions">
          <span>{words ? `${words.toLocaleString()} words` : ""}</span>
          <button type="button" className="lp-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="lp-btn is-dark" disabled={words < 20} onClick={() => onRead(text)}>
            Read this
          </button>
        </div>
      </div>
    </div>
  );
}
