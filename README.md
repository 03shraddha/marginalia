<p align="center">
  <a href="https://gloss-lovat.vercel.app"><img alt="Gloss" src="public/og.png"></a>
</p>

<h1 align="center">Gloss</h1>

<p align="center">A reader for articles, chapters and PDFs: select any line, start typing, and an open model writes the answer in the margin beside it, citing paragraphs you can check. <a href="https://gloss-lovat.vercel.app">gloss-lovat.vercel.app</a></p>

## Tech stack

- Next.js 16 (App Router, Turbopack), React 19, Tailwind v4, Zustand. No database: texts, glosses, highlights and settings live in the browser.
- Newsreader and Schibsted Grotesk, plus Literata and Atkinson Hyperlegible as optional reading faces; six themes, four pens and four highlighters from CSS variables, applied before first paint.
- Together AI over raw SSE fetch: DeepSeek V4.1 Flash (Quick, about 0.5s to first token) and DeepSeek V4 Pro (Deep), allow-listed in `lib/models.ts`.
- The whole text goes in the system prompt with `[¶n]` numbers, so follow-ups hit Together's prefix cache and answers cite paragraphs.
- Anchors are block id plus character offsets, rendered as React marks; margin layout and leader lines in `components/reader/Margin.tsx`.
- Import: links through `@mozilla/readability` on `linkedom` (with a private-address guard), PDFs through `pdfjs-dist` in the browser, plus pasted text and `.txt`/`.md`.

## Cloning & running

1. Install: `npm install`
2. Add a key: `echo "TOGETHER_API_KEY=your_key" > .env.local` (without one, answers are labelled demo output and readers can paste their own key in the app)
3. Run: `npm run dev`, open http://localhost:3100, and paste a link (or press ⌘V anywhere) or pick a card from the shelf
4. Read: select text and type to ask, `/` asks about the whole text, `j` and `k` walk paragraphs, `B` writes a brief, `?` lists every key
5. Check: `npm run lint && npm run build`, then deploy with `vercel --prod` (set `TOGETHER_API_KEY` in the project first)

## Roadmap

- [ ] ship it as a browser extension that opens the same margin on any page
- [ ] sync glosses and highlights across devices
- [ ] teach the PDF reader two-column layouts and footnotes
- [ ] let a gloss compare two passages you pick at once
- [ ] move the shared-key rate limit from memory to a store like Upstash so it holds across instances
- Accounts are skipped on purpose for now: the reader should work the second you paste a link.

## Security

`TOGETHER_API_KEY` stays server side. A key a reader pastes lives in their browser's localStorage and is sent only with their own requests. Requests on the shared key are rate limited per IP; link import refuses private, loopback and link-local addresses on every redirect hop.

Samples, all public domain via Project Gutenberg: Huxley, "On a Piece of Chalk" (1868); Schopenhauer, "On Thinking for Oneself" (trans. T. Bailey Saunders); Thoreau, "Reading" from Walden (1854). Rebuild them with `scripts/build-samples.mjs`; dashes are normalized to plain punctuation.
