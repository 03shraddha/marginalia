import Link from "next/link";
import { ArrowUpRight, AudioLines, Mic, MousePointerClick, MessageCircleQuestion, NotebookPen } from "lucide-react";
import { MODEL_LINE, NAME, SARVAM_URL } from "./name";

const STEPS = [
  { tone: "pink", Icon: MousePointerClick, title: "Select", body: "Mark a word, a line or a whole passage in anything you read." },
  { tone: "butter", Icon: MessageCircleQuestion, title: "Ask", body: "Explain, define, simplify, or type your own question." },
  { tone: "sky", Icon: NotebookPen, title: "Cited answer", body: "A short note lands in the margin. Each ¶ chip points to the paragraph it used." },
] as const;

const SOON = [
  { tone: "peach", Icon: AudioLines, title: "Read aloud", body: "Have any page read to you, and follow along." },
  { tone: "sage", Icon: Mic, title: "Ask by voice", body: "Speak your question instead of typing it. The answer still lands in the margin." },
] as const;

/** Below the desktop: the headline, how it works, what comes next, and the credit. */
export function Editorial() {
  return (
    <section id="how" className="mg-editorial" aria-labelledby="mg-headline">
      <p className="mg-subhead is-eyebrow">How it works</p>
      <h2 id="mg-headline" className="mg-headline">
        Read anything with a scholar <em>in the margin.</em>
      </h2>
      <p className="mg-dek">Paste a link or drop a PDF. Select any line and ask. A short answer arrives beside the words, with the paragraphs it used.</p>

      <ol className="mg-steps">
        {STEPS.map(({ tone, Icon, title, body }, i) => (
          <li key={title} className={`mg-pcard is-${tone}`} style={{ ["--i" as string]: i }}>
            <span className="mg-pcard-n">{i + 1}</span>
            <Icon size={22} strokeWidth={1.6} aria-hidden className="mg-pcard-icon" />
            <h3>{title}</h3>
            <p>{body}</p>
          </li>
        ))}
      </ol>

      <div className="mg-speedline">
        <p className="mg-speed-big">
          ~1<span>s</span>
        </p>
        <p className="mg-speed-copy">
          <strong>to the first word, most of the time.</strong> Answers stream from {MODEL_LINE}, so the note starts to appear while you are still on the line.
        </p>
      </div>

      <h3 className="mg-subhead">Also in {NAME}</h3>
      <ul className="mg-soon">
        {SOON.map(({ tone, Icon, title, body }) => (
          <li key={title} className={`mg-pcard is-${tone} is-wide`}>
            <Icon size={22} strokeWidth={1.6} aria-hidden className="mg-pcard-icon" />
            <div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          </li>
        ))}
      </ul>

      <footer className="mg-footer">
        <span>
          {NAME} ·{" "}
          <a href={SARVAM_URL} target="_blank" rel="noopener">
            Answers by Sarvam <ArrowUpRight size={13} aria-hidden />
          </a>
        </span>
        <Link href="/library">Your library</Link>
      </footer>
    </section>
  );
}
