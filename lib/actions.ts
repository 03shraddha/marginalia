/** Quick actions on a selection. Shared by the lens (labels) and the server (prompts). */

export type Action = "ask" | "explain" | "define" | "simplify" | "check" | "connect" | "counter";

export const ACTIONS: Record<Action, { label: string; hint: string }> = {
  ask: { label: "Ask", hint: "Type any question about it" },
  explain: { label: "Explain", hint: "What it means here, and why it is here" },
  define: { label: "Define", hint: "The word, as this author uses it" },
  simplify: { label: "Simplify", hint: "The same idea in plain words" },
  check: { label: "Fact-check", hint: "Does it still hold up? Searches the web" },
  connect: { label: "Related", hint: "Where else the text takes this up" },
  counter: { label: "Counterpoint", hint: "The strongest objection to it" },
};

/** Short selections get Define; longer ones get Simplify in the same slot. */
export const isShortSelection = (quote: string) => quote.trim().split(/\s+/).length <= 4;

export const ARTICLE_QUESTIONS = [
  "What is the core argument, in three sentences?",
  "What evidence does the author lean on most?",
  "What would a sharp skeptic say?",
];

/** How a one-click action reads in the notebook, so every entry scans as a question. */
export const ACTION_QUESTIONS: Record<Action, string> = {
  ask: "Your question",
  explain: "What does this mean here?",
  define: "What does this word mean here?",
  simplify: "Can you say it more simply?",
  check: "Does this still hold up?",
  connect: "Where else does the text take this up?",
  counter: "What is the strongest objection?",
};
