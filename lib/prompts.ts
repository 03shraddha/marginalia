import type { Action } from "./actions";
import type { ChatMessage } from "./together";

export type DocPayload = {
  title: string;
  author?: string;
  published?: string;
  paras: { n: number; text: string }[];
  /** True when only a window of a long document was sent. */
  partial?: boolean;
};

export type ThreadPayload = {
  action: Action;
  quote?: string;
  from?: number;
  to?: number;
  at?: number;
  question?: string;
};

/**
 * The system message carries the whole text and nothing that varies per
 * question, so Together's prefix cache serves every follow-up on the same
 * article at the cached rate (about 2% of the fresh input price on Flash).
 */
export function systemFor(doc: DocPayload): string {
  const byline = [doc.author, doc.published].filter(Boolean).join(", ");
  const body = doc.paras.map((p) => `[¶${p.n}] ${p.text}`).join("\n\n");
  return `You are Gloss, a reading companion. You write short notes in the margin of a text someone is studying closely. Think of a sharp, generous scholar leaning over their shoulder.

THE TEXT: "${doc.title}"${byline ? ` by ${byline}` : ""}.
Paragraphs are numbered [¶n]; the reader sees the same numbers in the margin.${doc.partial ? "\nOnly part of a long text is included below; say so if a question needs the rest." : ""}

<text>
${body}
</text>

How to write a gloss:
- Answer directly. No preamble, no restating the question, no sign-off.
- Plain, vivid prose. Short paragraphs. Use a list only for several distinct pointers.
- Keep to the length the reader asked for (given after the text). Brevity is respect for their attention.
- When you refer to the text, cite it inline as [¶n]. Only cite paragraphs that exist above.
- Keep the author's meaning separate from outside knowledge. When you bring in something the text does not say, mark it, for example "Outside the text, ...".
- If something is uncertain or disputed, say so plainly.
- Use **bold** sparingly for a key term. Never use headings.
- Never use em dashes or en dashes. Use commas, colons, parentheses or a plain hyphen.`;
}

function where(t: ThreadPayload): string {
  if (t.from && t.to && t.to !== t.from) return `[¶${t.from}] to [¶${t.to}]`;
  if (t.from) return `[¶${t.from}]`;
  return "";
}

const TASKS: Record<Exclude<Action, "ask">, string> = {
  explain:
    "Explain what this passage means and what work it is doing at this point in the text. Unpack any archaic phrasing or metaphor. 2 to 4 sentences.",
  define:
    "Define this as it is used here, in one or two sentences. If it is archaic, technical or used in an unusual sense, say so and give the plain modern equivalent.",
  simplify:
    "Rewrite this in plain, modern English that keeps the full meaning. Then add one short line on the point it makes.",
  check:
    "Does this still hold up? Compare it with current knowledge: say what has held up, what has changed, and how confident you are. This task is mostly outside the text, so mark it as such. 3 to 5 sentences.",
  connect:
    "Where else does the text develop, support or complicate this? Give 2 to 4 pointers as a list, each one line that starts with its citation, like [¶12].",
  counter:
    "Give the strongest objection or alternative reading a sharp critic would raise against this, in 2 or 3 sentences. Then one line on how the author might answer.",
};

/** The first user turn of a thread. Follow-ups are appended as plain turns. */
export function firstTurn(t: ThreadPayload): string {
  if (t.quote) {
    const loc = where(t);
    const head = `The reader selected this${loc ? ` in ${loc}` : ""}:\n«${t.quote.trim()}»`;
    if (t.action === "ask") return `${head}\n\nTheir question: ${t.question?.trim() || "What should I understand here?"}`;
    return `${head}\n\nTask: ${TASKS[t.action]}`;
  }
  // Whole-text question, asked from a reading position.
  const at = t.at ? `The reader is currently around [¶${t.at}].\n\n` : "";
  return `${at}Their question about the whole text: ${t.question?.trim() || "What is this text about?"}`;
}

const LENGTHS = {
  short: "Length: very short. One to three sentences, under 50 words, unless a list of pointers is asked for.",
  normal: "Length: concise. Under 90 words unless the task asks for more.",
  long: "Length: thorough. Up to about 180 words, still with no filler.",
} as const;

export type LengthKey = keyof typeof LENGTHS;
export const isLengthKey = (v: unknown): v is LengthKey => typeof v === "string" && v in LENGTHS;

export function buildMessages(
  doc: DocPayload,
  thread: ThreadPayload,
  history: { role: "user" | "assistant"; content: string }[] = [],
  length: LengthKey = "normal"
): ChatMessage[] {
  // The length note comes after the document, so the cached prefix is unchanged.
  return [
    { role: "system", content: systemFor(doc) },
    { role: "system", content: LENGTHS[length] },
    { role: "user", content: firstTurn(thread) },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
}

export const BRIEF_TASK = `Read the whole text and return JSON only, with this shape:
{
  "gist": "two sentences: what this text argues and why it matters",
  "claims": [{ "text": "one sentence", "cite": 12 }],
  "sections": [{ "title": "2 to 5 words", "start": 1 }]
}
Rules: 3 to 5 claims, each citing the single paragraph that best supports it. 4 to 8 sections that cover the text in order: "start" is the first paragraph number of each section, ascending, and the first section starts at the first paragraph. Section titles are sentence case and specific to this text. Never use em dashes or en dashes.`;

/** Canned demo answers, shown only when no key is available, always labelled. */
export function demoAnswer(t: ThreadPayload): string {
  const where = t.from ? ` about [¶${t.from}]` : "";
  return `This is demo output, not a model answer. With a Together API key, DeepSeek V4.1 Flash would read the whole text and write a real gloss${where} here, citing paragraphs like [¶3] so you can jump straight to them. Add your key from the key button in the top bar.`;
}
