import { Fragment, type ReactNode } from "react";
import { undash } from "@/lib/article";

/**
 * The demo answer, drawn small: ==key line== becomes a wash, [¶7] or [¶3-5]
 * becomes a superscript chip, and any other Markdown is dropped. It runs on
 * every streamed token, so it stays a few regexes.
 */
const TOKEN = /(==[^=\n]+?==|\[\s*¶\s?[\d\s,-]+\])/g;

function inline(line: string, key: string): ReactNode[] {
  return line.split(TOKEN).map((part, i) => {
    if (!part) return null;
    const k = `${key}-${i}`;
    if (part.startsWith("==") && part.endsWith("==")) return <mark key={k}>{part.slice(2, -2)}</mark>;
    if (part.startsWith("[")) {
      const n = part.replace(/[[\]\s¶]/g, "");
      return (
        <sup key={k} className="mg-cite" aria-label={`Paragraph ${n}`}>
          ¶{n}
        </sup>
      );
    }
    return <Fragment key={k}>{part}</Fragment>;
  });
}

function clean(text: string): string {
  return undash(text)
    .replace(/\*\*|__|`/g, "")
    .replace(/(^|\s)\*(\S[^*\n]*?)\*/g, "$1$2")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "• ")
    .replace(/\s?\[\d{1,2}(?:\s*,\s*\d{1,2})*\]/g, "");
}

export function MarginText({ text, caret }: { text: string; caret?: boolean }) {
  // Mid-stream: close an open ==mark== and hold back a half-written [¶ citation.
  let t = text.replace(/\[\s*¶?[\d\s,-]*$/, "");
  if ((t.match(/==/g)?.length ?? 0) % 2) t += "==";
  const paras = clean(t).split(/\n{2,}/).filter((p) => p.trim());
  if (!paras.length) paras.push("");
  return (
    <>
      {paras.map((p, i) => (
        <p key={i}>
          {p.split("\n").map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {inline(line, `${i}-${j}`)}
            </Fragment>
          ))}
          {caret && i === paras.length - 1 && <span className="mg-caret" aria-hidden />}
        </p>
      ))}
    </>
  );
}
