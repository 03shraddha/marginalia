"use client";

import { forwardRef } from "react";
import { ArrowRight, BookmarkPlus, FileUp, Link2 } from "lucide-react";
import { openKeyMenu } from "@/lib/ask";

export type Busy = null | { label: string; pct?: number };

type Props = {
  url: string;
  setUrl: (v: string) => void;
  busy: Busy;
  error: string | null;
  /** The error is fixed by the reader's own key: offer the key menu. */
  errorNeedsKey?: boolean;
  onSubmit: (url: string) => void;
  /** Keep it in the library for later, instead of reading it now. */
  onSave: (url: string) => void;
  onPickFile: () => void;
  className?: string;
};

/**
 * The address field: Safari's, in the window's toolbar on a wide screen and
 * pinned to the foot of the screen on a phone. Paste a link, or open a PDF.
 */
export const ImportBar = forwardRef<HTMLInputElement, Props>(function ImportBar({ url, setUrl, busy, error, errorNeedsKey, onSubmit, onSave, onPickFile, className = "" }, ref) {
  return (
    <div className={`mg-address-wrap ${className}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(url);
        }}
        className={`mg-address${busy ? " is-busy" : ""}`}
      >
        <Link2 size={15} className="mg-address-icon" aria-hidden />
        <input
          ref={ref}
          value={busy ? busy.label + (busy.pct !== undefined ? ` ${Math.round(busy.pct * 100)}%` : "") : url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={!!busy}
          placeholder="Paste a link or drop a PDF"
          aria-label="Link to read"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
        />
        {url.trim() && !busy ? (
          <>
            <button type="button" className="mg-address-btn" onClick={() => onSave(url)} aria-label="Save to your library" data-tip="Save for later">
              <BookmarkPlus size={16} />
            </button>
            <button type="submit" className="mg-address-go" aria-label="Read">
              <span>Read</span> <ArrowRight size={15} aria-hidden />
            </button>
          </>
        ) : (
          <button type="button" className="mg-address-btn" onClick={onPickFile} disabled={!!busy} aria-label="Open a PDF" data-tip="Open a PDF">
            <FileUp size={16} />
          </button>
        )}
        {busy && <span aria-hidden className="mg-address-progress" style={busy.pct !== undefined ? { ["--p" as string]: busy.pct } : undefined} />}
      </form>
      {error && (
        <p className="mg-address-error" role="alert">
          {error}
          {errorNeedsKey && (
            <>
              {" "}
              <button type="button" onClick={openKeyMenu}>
                Add your Sarvam key
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
});
