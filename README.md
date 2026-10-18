# Marginalia

An AI reader for articles and PDFs. Select a line, ask a question, and get a short answer in the margin.

## What it does

- Paste a link or drop a PDF to open it in a clean reader.
- Select any line and ask about it. The answer shows up in the margin.
- Answers cite the paragraph they come from, so you can check them.
- Quick actions: Explain, Define, Simplify, Fact-check, Related, Counterpoint.
- Ask by voice. Hold the mic button and speak your question.
- Read aloud. Pick a voice and listen to the article.
- Get a short brief of the whole piece.
- Highlight lines and keep notes. Export them as Markdown.

## How it is built

- Answers come from DeepSeek V4.1 Flash on the Sarvam v2 chat completions API.
- Thinking is off and the article sits in a fixed system prompt, so answers start fast and follow-ups hit the cache.
- Read aloud uses Sarvam Bulbul. Ask by voice uses Sarvam Saaras.
- Next.js app router with Tailwind.
- Optional: Clerk for accounts, Neon for sync, Exa for web search.

## Run it

1. Clone the repo.
2. Copy `.env.example` to `.env.local` and add your `SARVAM_API_KEY`.
3. Run `npm install`.
4. Run `npm run dev` and open http://localhost:3100.

Accounts, sync and web search are optional. The app runs with only a Sarvam key.

