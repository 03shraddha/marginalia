"use client";

import { Fragment, memo, type ReactNode } from "react";
import { undash } from "@/lib/article";
import { useReader } from "./context";

/**
 * A deliberately small Markdown subset for glosses: paragraphs, lists, bold,
 * italic, code, and paragraph citations ([¶12], [¶3-5], ¶7) as live chips.
 * Small enough to re-parse on every streamed token without a dependency.
 */

type Part = { kind: "p" | "ul" | "ol"; lines: string[] };

function parseBlocks(text: string): Part[] {
  const parts: Part[] = [];
  for (const chunk of text.split(/\n{2,}/)) {
    const lines = chunk.split("\n").filter((l) => l.trim());
    if (!lines.length) continue;
    const isUl = lines.every((l) => /^\s*[-*•]\s+/.test(l));
    const isOl = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
    if (isUl || isOl) {
      parts.push({ kind: isUl ? "ul" : "ol", lines: lines.map((l) => l.replace(/^\s*([-*•]|\d+[.)])\s+/, "")) });
      continue;
    }
    // Mixed chunk: a lead line followed by list items.
    const firstItem = lines.findIndex((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
    if (firstItem > 0 && lines.slice(firstItem).every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
      parts.push({ kind: "p", lines: [lines.slice(0, firstItem).join(" ")] });
      parts.push({ kind: "ul", lines: lines.slice(firstItem).map((l) => l.replace(/^\s*([-*•]|\d+[.)])\s+/, "")) });
      continue;
    }
    parts.push({ kind: "p", lines: [lines.join(" ")] });
  }
  return parts;
}

const TOKEN = /(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(`[^`]+`)|(\[\s*¶[^\]]{0,60}\])|(¶\s?\d+(?:\s?-\s?\d+)?)/g;

function Cite({ n, label }: { n: number; label: string }) {
  const { jumpTo, peek, ix } = useReader();
  const exists = ix.byNumber.has(n);
  return (
    <button
      type="button"
      className="cite"
      disabled={!exists}
      onClick={(e) => {
        e.stopPropagation();
        peek(null);
        jumpTo(n);
      }}
      onMouseEnter={(e) => exists && peek(n, e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => peek(null)}
      onFocus={(e) => exists && peek(n, e.currentTarget.getBoundingClientRect())}
      onBlur={() => peek(null)}
      aria-label={`Jump to paragraph ${n}`}
    >
      ¶{label}
    </button>
  );
}

function citesFrom(raw: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\d+)(?:\s*-\s*¶?\s*(\d+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const a = Number(m[1]);
    const label = m[2] ? `${m[1]}-${m[2]}` : m[1];
    out.push(<Cite key={`${m.index}`} n={a} label={label} />);
  }
  return out;
}

function inline(text: string, plain = false): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = String(m.index);
    if (m[1]) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (m[2]) out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    else if (m[3]) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (!plain) out.push(<Fragment key={k}>{citesFrom(tok)}</Fragment>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** `plain` drops paragraph citations, for answers that live outside a reader. */
function AnswerImpl({ text, streaming, plain = false }: { text: string; streaming?: boolean; plain?: boolean }) {
  const parts = parseBlocks(undash(plain ? text.replace(/\s?\[\s*¶[^\]]{0,60}\]/g, "") : text));
  const caret = streaming ? <span className="caret" aria-hidden /> : null;
  if (!parts.length) return streaming ? <p>{caret}</p> : null;
  return (
    <>
      {parts.map((p, i) => {
        const isLast = i === parts.length - 1;
        if (p.kind === "p")
          return (
            <p key={i}>
              {inline(p.lines[0], plain)}
              {isLast && caret}
            </p>
          );
        const L = p.kind === "ul" ? "ul" : "ol";
        return (
          <L key={i}>
            {p.lines.map((l, j) => (
              <li key={j}>
                {inline(l, plain)}
                {isLast && j === p.lines.length - 1 && caret}
              </li>
            ))}
          </L>
        );
      })}
    </>
  );
}

export const Answer = memo(AnswerImpl);
