// Builds the bundled public-domain samples from Project Gutenberg plain text.
// Usage: GUTENBERG_DIR=<dir with pg10060.txt, pg10714.txt, pg205.txt> node scripts/build-samples.mjs
import fs from "node:fs";
import path from "node:path";

const dir = process.env.GUTENBERG_DIR ?? ".";

const SAMPLES = [
  {
    file: "pg10060.txt",
    from: "ON A PIECE OF CHALK\n\n[1868]",
    to: "\n\n\n\nII\n",
    id: "on-a-piece-of-chalk",
    title: "On a Piece of Chalk",
    author: "Thomas Henry Huxley",
    published: "1868",
    dek: "A lecture to the working men of Norwich, in which a lump of chalk becomes a history of the earth.",
    source: "Project Gutenberg, Discourses: Biological and Geological (public domain)",
    sourceUrl: "https://www.gutenberg.org/ebooks/10060",
    // Kept as in V1 so anchors saved against this text stay put.
    dash: " - ",
  },
  {
    file: "pg10714.txt",
    from: "ON THINKING FOR ONESELF.",
    to: "ON CRITICISM.",
    id: "on-thinking-for-oneself",
    title: "On Thinking for Oneself",
    author: "Arthur Schopenhauer",
    published: "1851",
    dek: "Why a mind that only reads becomes a library in disorder, and what it takes to think a thing through yourself.",
    source: "Project Gutenberg, The Art of Literature, trans. T. Bailey Saunders (public domain)",
    sourceUrl: "https://www.gutenberg.org/ebooks/10714",
  },
  {
    file: "pg205.txt",
    from: "\nReading\n",
    to: "\nSounds\n\nBut while we are confined",
    id: "walden-reading",
    title: "Reading",
    author: "Henry David Thoreau",
    published: "1854",
    dek: "From Walden: a case for reading the hardest books slowly, in the language they were written, as the noblest exercise a reader can take.",
    source: "Project Gutenberg, Walden (public domain)",
    sourceUrl: "https://www.gutenberg.org/ebooks/205",
  },
];

function unwrap(p) {
  return p
    .split("\n")
    .map((l) => l.trim())
    .reduce((acc, line) => (!acc ? line : /[A-Za-z]-$/.test(acc) ? acc + line : acc + " " + line), "");
}

function tidy(s, dash = ", ") {
  return (
    s
      .replace(/Globigcrinoe/g, "Globigerinæ")
      .replace(/([A-Z][a-z]+)oe(?![a-z])/g, "$1æ")
      // No em or en dashes anywhere: they become plain punctuation.
      .replace(/([,;:])\s*(--|\u2014)\s*/g, "$1 ")
      .replace(/\s*(--|\u2014|\u2013)\s*/g, dash)
      .replace(/,\s*([.;:!?])/g, "$1")
      .replace(/\s{2,}/g, " ")
      .replace(/(^|[\s(\[_])"/g, "$1“")
      .replace(/"/g, "”")
      .replace(/(^|[\s(\[_])'/g, "$1‘")
      .replace(/'/g, "’")
  );
}

function toRuns(text) {
  const runs = [];
  const re = /_([^_]+)_/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index) });
    runs.push({ text: m[1], em: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs;
}

for (const s of SAMPLES) {
  const raw = fs.readFileSync(path.join(dir, s.file), "utf8").replace(/\r/g, "");
  const start = raw.indexOf(s.from);
  const end = raw.indexOf(s.to, start + s.from.length);
  if (start < 0 || end < 0) throw new Error(`Could not find bounds for ${s.id}`);
  const body = raw.slice(start + s.from.length, end);

  const paras = body.split(/\n\s*\n/).map(unwrap).map((p) => p.trim()).filter(Boolean);
  const blocks = [];
  const notes = [];
  let n = 0;
  for (const p of paras) {
    const fn = p.match(/^\[Footnote (\d+):\s*([\s\S]*)\]$/);
    if (fn) {
      notes.push(tidy(fn[2], s.dash).replace(/^_?Translator’s Note_?\.\s*/i, "Translator’s note: "));
      continue;
    }
    // Inline footnote markers become a bracketed number.
    const text = tidy(p, s.dash).replace(/\s?\[(\d)\]/g, "\u2009[$1]");
    blocks.push({ id: `p${++n}`, type: "p", runs: toRuns(text) });
  }
  if (notes.length) {
    blocks.push({ id: "notes", type: "h2", runs: [{ text: "Notes" }] });
    notes.forEach((t, i) => blocks.push({ id: `p${++n}`, type: "note", runs: [{ text: `[${i + 1}] ` }, ...toRuns(t)] }));
  }
  const { file, from, to, dash, ...meta } = s;
  fs.writeFileSync(new URL(`../content/${s.id}.json`, import.meta.url), JSON.stringify({ ...meta, blocks }, null, 1));
  const words = blocks.reduce((a, b) => a + b.runs.map((r) => r.text).join("").split(/\s+/).length, 0);
  const dashes = JSON.stringify(blocks).match(/[\u2013\u2014]|--/g)?.length ?? 0;
  console.log(`${s.id}: ${blocks.length} blocks, ${notes.length} notes, ${words} words, dashes left: ${dashes}`);
}
