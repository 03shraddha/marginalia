"use client";

import { useEffect, useState } from "react";
import { ArrowRight, FileUp, TextCursorInput } from "lucide-react";

/**
 * What the Dock's "+" opens: a sheet with one link field, one place to drop
 * or pick a PDF, and a way to paste plain text instead.
 */
export function ImportSheet({
  open,
  onClose,
  onUrl,
  onPickFile,
  onPasteText,
}: {
  open: boolean;
  onClose: () => void;
  onUrl: (url: string) => void;
  onPickFile: () => void;
  onPasteText: () => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!open) return;
    setUrl("");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="mg-scrim" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Open something to read" className="mg-sheet" onClick={(e) => e.stopPropagation()}>
        <h2 className="mg-sheet-title">Open something to read</h2>
        <p className="mg-sheet-sub">A link to an article, a PDF, or a page of text.</p>
        <form
          className="mg-sheet-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!url.trim()) return;
            onClose();
            onUrl(url);
          }}
        >
          <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" aria-label="Link to read" inputMode="url" autoComplete="off" spellCheck={false} className="mg-sheet-input" />
          <button type="submit" className="mg-btn is-primary" disabled={!url.trim()}>
            Read <ArrowRight size={15} aria-hidden />
          </button>
        </form>
        <button
          type="button"
          className="mg-drop"
          onClick={() => {
            onClose();
            onPickFile();
          }}
        >
          <FileUp size={22} aria-hidden />
          <span>Drop a PDF anywhere, or choose one</span>
          <small>PDF, .txt or .md</small>
        </button>
        <div className="mg-sheet-actions">
          <button
            type="button"
            className="mg-btn is-plain"
            onClick={() => {
              onClose();
              onPasteText();
            }}
          >
            <TextCursorInput size={15} aria-hidden /> Paste text instead
          </button>
          <button type="button" className="mg-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
