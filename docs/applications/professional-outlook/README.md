# Professional Outlook — 8-page pitch deck (October 2026)

**Deliverable:** `Elena_Revicheva_Professional_Outlook_2026.pdf` — 16:9, 8 pages, ~4 MB (under the 5 MB
outreach-attachment cap). Text is real, selectable text; all five links are clickable.

Built from Elena's two drafts of 26–28 Sep / 1 Oct 2026 ("My Professional Outlook" notes + the first
7-slide outlook PDF): the Elena + AIPA operating unit, the operating-model sentence (verbatim, same as
`src/cover-letter.ts`), the three lanes, the role list and the role test.

## Rebuild

```bash
python render.py
```

Needs Chrome or Edge, Pillow and PyMuPDF. Fonts (Geist, Geist Mono, Instrument Serif — OFL) are local in
`fonts/`, so the render never touches the network.

## Why the render has two passes

Gradient text (CSS `background-clip:text`), gradient-filled SVG text and soft radial glows all print as
masked PDF shadings. Chrome's own viewer shows them fine; **poppler draws hairline boxes around them and
filled rectangles instead of SVG gradient text; MuPDF draws lines through glow centres.** So:

1. `?bg=N` screenshots each slide's background + every gradient (`[data-g]` text, `.bake` art) at 2x → `bg/sN.jpg`.
2. `?raster=1` prints the deck over those JPEGs. Gradient text is still in the PDF as invisible vector text,
   so search and copy-paste work.

Do not "simplify" back to CSS gradients — check the output in poppler (`pdftoppm`) before trusting it.

## Numbers — only verified floors

Every figure comes from the CV sources that carry their own verification notes, counted 28–29 Sep 2026:
`scripts/build-lane-cv.cjs` (PROJECTS) and `scripts/build_tailored_cv.py`. Re-count before reusing the
deck in November. Never add "131 tests", "10 agents" or "solo" (see memory/CLAUDE.md).

## Art — made with the ATUONA stills engines

`gen-art.cjs` + `art-jobs.json` call the same Replicate models and inputs as the Atuona bot's `/imagine`
(`dist/atuona-image-pins.js`), run once on Oracle from `~/cto-aipa` (one-off script in `~/outlook-art/`,
no service touched). 14 stills generated on 1 Oct 2026, 6 used:

| File | Engine | Slide |
|---|---|---|
| `art/cover.jpg` | GPT Image 2 | 1 — one core, eight agent nodes |
| `art/ops.jpg` | Seedream 5 Pro | 4 — AI Operations card |
| `art/product.jpg` | Flux 2 Max | 4 — AI Product card |
| `art/creative.jpg` | Seedream 5 Pro | 4 — Creative AI card |
| `art/failure.jpg` | Seedream 5 Pro | 6 — kintsugi |
| `art/close.jpg` | Seedream 5 Pro | 8 — the doorway |

Abstract only: no people, no likenesses, no text in the images.
