import type { DocPayload } from "./prompts";

/**
 * What the landing page's live try-it reads. Highlight any word on the home
 * page and ask: the model answers from this, the same way it answers about
 * an article inside the reader.
 */
const PARAS = [
  "Highlight any line. Ask it anything. That is the whole idea of Gloss, the page you are on: a reader for articles, book chapters and PDFs. Paste a link, drop a file, or paste text, and it opens as a quiet page with numbered paragraphs.",
  "Highlight any passage and start typing to ask about it, or pick a quick action: Explain, Define or Simplify, and under More, Fact-check (does it still hold up today?), Related (where else the text takes it up) and Counterpoint (the strongest objection). You can also highlight in four colours and copy a quote with its paragraph number. The answer is written in the margin beside the passage, with a thin line tying the note to the words it explains.",
  "Every answer leads with the line that answers you, marked like a highlighter, so you can stop reading there. Answers cite paragraph numbers like ¶12, so every claim can be checked against the text with one click. You can ask follow-ups inside the same note, or hand the question to the deeper model. A closed note shrinks to its question and that one line.",
  "Gloss this text gives the gist, the key claims and a map of the sections before you start. The notebook collects highlights and notes in reading order and exports them as Markdown.",
  "Answers come from open models served by Together AI: DeepSeek V4.1 Flash for quick answers, about half a second to the first word, and Kimi K3 for slower, more careful ones. Each answer shows what it cost, usually a fraction of a cent.",
  "Everything you import and write stays in your browser. You can bring your own Together API key, and it is stored only in your browser.",
  "Keys: slash asks about the whole text, J and K move between paragraphs, Enter asks about the current paragraph, B makes a brief, N opens the notebook, and the question mark lists every key.",
  "The page is yours to tune: six themes, four pen colours for the model's notes, four typefaces (a serif, a book face, a sans and one built for legibility), size, line spacing, column width, justified or ragged text, indented or spaced paragraphs, and how long answers should be.",
  "Your shelf keeps every text you have opened, with how far you got. When there are more than fit on the desk, the rest wait in a pile; press S to search the whole shelf.",
];

export const ABOUT_DOC: DocPayload = {
  title: "Gloss, the reader you are looking at",
  paras: PARAS.map((text, i) => ({ n: i + 1, text })),
};
