# PDF eval, 2026-10-10

15 hard pages (two-column papers, tables, heavy maths, a tax form, slides, prose with footnotes,
a 1996 TeX paper, two synthetic scans), each read four ways, then scored blind 1-10 by a judge
looking at the page image. Run with `python scripts/pdf-eval/run.py`; pages in `pages.json`.

| Reader | Score | Pages won | Fidelity | Order | Structure | Tables | Maths | $ / page | Median s |
|---|---|---|---|---|---|---|---|---|---|
| Text layer (raw extraction, not LiteParse) | 2.4 | 0 | 3.2 | 3.1 | 1.1 | 1.0 | 1.5 | 0 | 0 |
| Qwen3.5-9B on Together, page image | 6.5 | 3 | 4.3 | 4.8 | 3.5 | 3.7 | 4.5 | 0.0005 | 10 |
| LlamaParse cost_effective | 6.9 | 2 | 4.2 | 4.9 | 3.7 | 4.3 | 4.3 | 0.0037 | 8 |
| LlamaParse agentic | **8.1** | **10** | 4.7 | 4.7 | 4.5 | 4.7 | 4.3 | 0.0125 | 10 |

Sub-scores are 1-5. Ties count as a win for each.

| Page | Text layer | Qwen3.5-9B | LP cost | LP agentic |
|---|---|---|---|---|
| resnet-p1 (two-column, charts) | 3 | **7** | 5 | 4 |
| resnet-p6 (tables) | 2 | **8** | 5 | 7 |
| attention-p3 (figure) | 4 | **9** | 5 | 7 |
| attention-p8 (results table) | 3 | 7 | 8 | **9** |
| vae-p3 (maths) | 2 | 6 | 7 | **8** |
| vae-p4 (maths) | 2 | 6 | 7 | **8** |
| w4-p1 (form) | 2 | 5 | 6 | **7** |
| w4-p3 (form worksheet) | 2 | 4 | **8** | 7 |
| slides-p3 | 3 | 7 | **9** | 8 |
| slides-p5 | 3 | 5 | 7 | **10** |
| fomc-p1 (prose) | 3 | 6 | 7 | **9** |
| fomc-p5 (footnotes) | 3 | 8 | 9 | **10** |
| tex1996-p1 (1996 TeX) | 2 | 8 | 7 | **9** |
| scan-fomc-p2 | 1 | 6 | 7 | **10** |
| scan-attention-p4 | 1 | 6 | 7 | **8** |

## What went wrong, by reader
- **LlamaParse, both tiers: invented data from charts.** On resnet-p1 both turned Figure 1's training
  curves into tables of made-up error values (7 and 13 rows); cost_effective also turned a diagram into a
  nonsense "Stage/Component" table (attention-p3). This is why Qwen wins the figure-heavy pages.
- **Qwen3.5-9B:** weakest on forms (w4-p3: line numbers dropped, items turned into headings, an empty
  table added) and slides. Its one invented line, a "[Figure: ...]" description, came from our prompt asking
  it to describe figures.
- **Text layer:** no Markdown at all; columns interleaved, hyphenation kept, maths as Unicode soup, nothing on scans.

Not measured: LiteParse, which is the free path in the app now. Add it as a fifth reader next.
