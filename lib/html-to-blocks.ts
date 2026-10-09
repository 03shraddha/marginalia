import { undash, type Block, type BlockType, type Run } from "./article";

/**
 * Walks a cleaned article DOM (Readability output) into Gloss blocks.
 * Works with any DOM implementation: it only touches nodeType, tagName,
 * childNodes, textContent and getAttribute.
 */

type El = {
  nodeType: number;
  tagName?: string;
  childNodes: ArrayLike<El>;
  textContent: string | null;
  getAttribute?: (n: string) => string | null;
};

const BLOCK_TAGS: Record<string, BlockType> = {
  P: "p",
  H1: "h2",
  H2: "h2",
  H3: "h3",
  H4: "h3",
  H5: "h3",
  H6: "h3",
  BLOCKQUOTE: "quote",
  LI: "li",
  PRE: "pre",
  FIGCAPTION: "note",
  DT: "p",
  DD: "p",
};

const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "IFRAME", "FORM", "BUTTON", "NAV", "FOOTER", "TABLE", "IMG", "PICTURE", "VIDEO", "AUDIO"]);

function inlineRuns(node: El, marks: Omit<Run, "text"> = {}, out: Run[] = []): Run[] {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      const t = (child.textContent ?? "").replace(/\s+/g, " ");
      if (t) out.push({ text: t, ...marks });
      continue;
    }
    if (child.nodeType !== 1 || !child.tagName) continue;
    const tag = child.tagName.toUpperCase();
    if (SKIP.has(tag)) continue;
    if (tag === "BR") {
      out.push({ text: " ", ...marks });
      continue;
    }
    if (tag === "SUP" && /^\[?\d+\]?$/.test((child.textContent ?? "").trim())) continue; // footnote markers
    const next = { ...marks };
    if (tag === "EM" || tag === "I" || tag === "CITE") next.em = true;
    if (tag === "STRONG" || tag === "B") next.strong = true;
    if (tag === "CODE" || tag === "KBD") next.code = true;
    if (tag === "A") {
      const href = child.getAttribute?.("href");
      if (href && /^https?:/i.test(href)) next.href = href;
    }
    inlineRuns(child, next, out);
  }
  return out;
}

function tidyRuns(runs: Run[]): Run[] {
  // Merge neighbours with identical marks, collapse whitespace, trim the ends.
  const merged: Run[] = [];
  for (const r of runs) {
    const prev = merged[merged.length - 1];
    if (prev && prev.em === r.em && prev.strong === r.strong && prev.code === r.code && prev.href === r.href) prev.text += r.text;
    else merged.push({ ...r });
  }
  // Typographic quotes, using the previous run's last character as context.
  let prev = " ";
  for (const r of merged) {
    let t = undash(r.text.replace(/\s+/g, " "));
    if (!r.code) {
      let out = "";
      for (const ch of t) {
        if (ch === '"') out += /[\s(\[{\u2014-]/.test(prev) ? "\u201C" : "\u201D";
        else if (ch === "'") out += /[\s(\[{\u2014-]/.test(prev) ? "\u2018" : "\u2019";
        else out += ch;
        prev = ch;
      }
      t = out;
    } else if (t) prev = t[t.length - 1];
    r.text = t;
  }
  if (merged[0]) merged[0].text = merged[0].text.trimStart();
  const last = merged[merged.length - 1];
  if (last) last.text = last.text.trimEnd();
  return merged.filter((r) => r.text.length > 0);
}

export function htmlToBlocks(root: El): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  const visit = (node: El) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== 1 || !child.tagName) {
        // Stray text directly in a container becomes its own paragraph.
        if (child.nodeType === 3 && (child.textContent ?? "").trim().length > 40) {
          blocks.push({ id: `b${++i}`, type: "p", runs: tidyRuns([{ text: child.textContent ?? "" }]) });
        }
        continue;
      }
      const tag = child.tagName.toUpperCase();
      if (SKIP.has(tag)) continue;
      const type = BLOCK_TAGS[tag];

      if (type === "pre") {
        const text = (child.textContent ?? "").replace(/\s+$/, "");
        if (text.trim()) blocks.push({ id: `b${++i}`, type, runs: [{ text, code: true }] });
        continue;
      }
      if (type === "quote" || type === "li") {
        // Containers that hold their own paragraphs: descend, tagging the leaves.
        const hasBlockChildren = Array.from(child.childNodes).some(
          (c) => c.nodeType === 1 && c.tagName && BLOCK_TAGS[c.tagName.toUpperCase()]
        );
        if (hasBlockChildren) {
          const before = blocks.length;
          visit(child);
          if (type === "quote") for (let k = before; k < blocks.length; k++) if (blocks[k].type === "p") blocks[k].type = "quote";
          continue;
        }
      }
      if (type) {
        const runs = tidyRuns(inlineRuns(child));
        const text = runs.map((r) => r.text).join("");
        if (text.trim().length === 0) continue;
        blocks.push({ id: `b${++i}`, type, runs });
        continue;
      }
      visit(child);
    }
  };

  visit(root);
  // Reference apparatus at the end (Wikipedia and friends) is not reading matter.
  const TAIL = /^(references|notes|footnotes|citations|sources|bibliography|see also|external links|further reading)$/i;
  const tailAt = blocks.findIndex((b, idx) => idx > 3 && (b.type === "h2" || b.type === "h3") && TAIL.test(b.runs.map((r) => r.text).join("").trim()));
  const body = tailAt > 0 ? blocks.slice(0, tailAt) : blocks;
  const textOf = (b: Block) => b.runs.map((r) => r.text).join("").trim();
  const isCitation = (t: string) => /^(↑|\^)/.test(t) || /^\d+( \d+)+ /.test(t) || /(Retrieved|Archived from|ISBN|doi:)/.test(t);
  let cleaned = body.filter((b) => {
    const t = textOf(b);
    return t.length > 1 && !/^\[?edit\]?$/i.test(t) && !/^From Wikipedia, the free encyclopedia$/i.test(t) && !(b.type === "li" && isCitation(t));
  });
  // A run of short list items after the last paragraph is a "see also" list.
  const lastProse = cleaned.reduce((at, b, idx) => (b.type === "p" || b.type === "quote" ? idx : at), -1);
  const tail = cleaned.slice(lastProse + 1);
  if (tail.length >= 8 || (tail.length >= 5 && tail.every((b) => textOf(b).length < 160))) cleaned = cleaned.slice(0, lastProse + 1);
  return cleaned;
}
