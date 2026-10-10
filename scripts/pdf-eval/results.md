# PDF eval, 2026-10-10

15 hard pages (two-column papers, tables, heavy maths, a tax form, slides, prose with footnotes,
a 1996 TeX paper, two synthetic scans), each read five ways, then scored blind 1-10 by a judge
looking at the page image. `run.py` runs four readers; `app-import.mjs` runs the app's own import
in headless Chrome as the fifth. Pages are in `pages.json`.

| Reader | Score | Pages won | Fidelity | Order | Structure | Tables | Maths | $ / page | Median s |
|---|---|---|---|---|---|---|---|---|---|
| Text layer (raw extraction) | 2.9 | 0 | 3.3 | 3.3 | 1.0 | 1.0 | 1.5 | 0 | 0 |
| **Gloss today** (LiteParse in the browser, Qwen3.8 Flash for scans) | 3.9 | 0 | 3.1 | 2.7 | 2.2 | 1.5 | 1.7 | 0 | under 1 |
| Qwen3.5-9B on Together, page image | 6.9 | 3 | 4.1 | 4.8 | 3.7 | 4.5 | 4.8 | 0.0005 | 10 |
| LlamaParse cost_effective | 7.4 | 1 | 4.3 | 4.9 | 3.9 | 5.0 | 4.7 | 0.0037 | 8 |
| LlamaParse agentic (behind "Read it more carefully") | **8.3** | **11** | 4.7 | 4.9 | 4.7 | 5.0 | 4.8 | 0.0125 | 10 |

Sub-scores are 1-5; ties count as a win for each. A first round without Gloss today scored the other
four 2.4 / 6.5 / 6.9 / 8.1, the same order.

| Page | Text layer | Gloss today | Qwen3.5-9B | LP cost | LP agentic |
|---|---|---|---|---|---|
| resnet-p1 | 2 | 4 | **6** | 5 | 3 |
| resnet-p6 | 3 | 2 | **9** | 5 | 8 |
| attention-p3 | 3 | 5 | **9** | 6 | 7 |
| attention-p8 | 3 | 4 | 7 | 8 | **9** |
| vae-p3 | 3 | 2 | 7 | 8 | **9** |
| vae-p4 | 3 | 2 | 7 | 8 | **9** |
| w4-p1 | 3 | 2 | 6 | 7 | **8** |
| w4-p3 | 3 | 4 | 5 | **9** | 8 |
| slides-p3 | 4 | 5 | 7 | 8 | **9** |
| slides-p5 | 4 | 5 | 6 | 8 | **9** |
| fomc-p1 | 5 | 3 | 7 | 8 | **9** |
| fomc-p5 | 4 | 5 | 8 | 9 | **10** |
| tex1996-p1 | 2 | 3 | 7 | 8 | **9** |
| scan-fomc-p2 | 1 | 8 | 6 | 7 | **9** |
| scan-attention-p4 | 1 | 5 | 6 | 7 | **8** |

## What went wrong, by reader
- **Gloss today:** columns spliced together (fomc-p1, resnet-p6, w4-p1), tables shredded into prose
  (resnet-p6, attention-p8), maths symbols dropped (every epsilon on vae-p3/p4), slide lists flattened,
  fi/fl ligatures lost on old TeX ("Arti cial"). Its scan path is good (scan-fomc-p2: 8), but the Markdown
  conversion turns maths underscores into emphasis ("$d*k$", scan-attention-p4).
  Partly an artefact here: each page is imported alone, so a mid-page heading became the title.
- **LlamaParse, both tiers:** invented data from charts. On resnet-p1 both turned Figure 1's training curves
  into tables of made-up error values; cost_effective also made a nonsense table from a diagram (attention-p3).
- **Qwen3.5-9B:** weakest on forms (w4-p3) and slides; its one invented line came from our prompt asking it
  to describe figures.
- **Text layer:** no structure at all; columns interleaved, maths as Unicode soup, nothing on scans.
