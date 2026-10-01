# Professional Outlook — 8-page pitch deck (October 2026)

**Deliverables:** `Elena_Revicheva_Professional_Outlook_2026.pdf` (English) and `Elena_Revicheva_Professional_Outlook_2026_ES.pdf`
(Spanish). Each is 16:9, 8 pages and about 3.9 MB, so it fits under the 5 MB outreach-attachment cap. The text is real, selectable
text, and all five links are clickable.

**Where they live (1 Oct 2026):**
- **Website:** `aideazz` repo `public/`, served at `aideazz.xyz/Elena_Revicheva_Professional_Outlook_2026{,_ES}.pdf`. The
  aideazz.xyz/api footer "About" / "Acerca de" opens the deck in the reader's language (`labApi.aboutDeckHref` in `en.json` /
  `es.json`). **After a rebuild, copy both PDFs there too, or the site keeps serving the old deck.**
- **Desktop:** Elena's `2 Decks 01.10.2026` folder holds `…_EN.pdf` and `…_ES.pdf` (her request).

**Spanish edition:** `python make-es.py` builds `outlook-es.html` from `outlook.html` with an explicit EN→ES pair list.
- It **fails** if an English string is not found, so an English edit cannot ship half-translated.
- Spanish-only size tweaks sit in that script, because Spanish runs about 25% longer. The English layout stays as approved.
- Role titles on slide 7 stay in English, as LATAM postings write them.
- The "How I work" sentence reuses Elena's own Spanish from the Marketo letter.

Built from Elena's two drafts of 26–28 Sep / 1 Oct 2026 (the "My Professional Outlook" notes and the first 7-slide outlook PDF).
It carries:

- the Elena + AIPA operating unit
- the operating-model sentence, verbatim, the same as `src/cover-letter.ts`
- the three lanes
- the role list and the role test

**Style (Elena, 1 Oct 2026):** the 2026 "naturalistic high-tech" trend: light, airy nature photography. The letters and
components come from the HubSpot UI:

- **Lexend Deca** (HubSpot's UI typeface, OFL)
- white record cards with avatars
- HubSpot-style tags
- a board view for the six-step method
- dashboard report tiles for the evidence
- a Note activity card for the operating-model quote

The first, dark version is in git at `a5a6db3` (Elena: "good, but…" → this one replaced it).

## Originality: why no one can claim we copied their design

Elena asked for this explicitly (1 Oct 2026). A visual *style* (light nature photos, clean UI type) is not anyone's property. A
site's specific expression is: its images, logo, and signature hero composition. So:

- **Every image is our own**, generated on the ATUONA engines from our prompts. No third-party photo, logo or asset is used.
- **Lexend Deca is open-licensed** (SIL OFL). No HubSpot logo or trademark appears; "HubSpot" is only named as a tool she uses.
- **The cover was redesigned** away from a look-alike of one AI company's homepage hero (floating island + stream, dot
  dissolve, centred headline over the image, website nav with a dark "book a call" button, stats over the photo). It is now a
  real Panama landscape, with a left-aligned headline, the deck's own header, and stats as cards.

Keep it that way: never paste a reference site's image, logo or exact hero layout into this deck.

## Rebuild

```bash
python make-es.py && python render.py
```

Needs Chrome or Edge, Pillow and PyMuPDF. The fonts are local in `fonts/`, so the render never touches the network.

## Why the render has two passes

Soft alpha overlays (photo fades, readability shades), CSS gradient text and radial glows all print as masked PDF shadings. Chrome's own
viewer shows them fine, but **poppler draws hairline boxes and MuPDF draws lines through them.** So the render runs in two passes:

1. `?bg=N` screenshots each slide's photographic background plus every `.bake` layer (the photos and their shades) at 2x, into `bg/sN.jpg`.
2. `?raster=1` prints the deck over those JPEGs. Cards, text, tags and links stay vector, so search and copy-paste work.

Check output in poppler (`pdftoppm`) before trusting a design change.

## Numbers: verified floors only

Every figure comes from the CV sources that carry their own verification notes, counted 28–29 Sep 2026:
`scripts/build-lane-cv.cjs` (PROJECTS) and `scripts/build_tailored_cv.py`. Re-count before reusing the deck in November. Never add
"131 tests", "10 agents" or "solo".

## Art: made with the ATUONA stills engines

`gen-art.cjs` calls the same Replicate models and inputs as the Atuona bot's `/imagine` (`dist/atuona-image-pins.js`). It runs on
Oracle from `~/cto-aipa` as a one-off script in `~/outlook-art/`; no service is touched. `art-jobs.json` holds the exact prompt and
the engine whose output was used for each image:

| File | Engine | Slide |
|---|---|---|
| `art/l-cover.jpg` | Nano Banana Pro | 1: two shores of Panama: the real Panama City skyline (F&F Tower, Punta Pacífica, Punta Paitilla, Cinta Costera) and the mountains |
| `art/l-water.jpg` | Flux 2 Max | 2, 4, 5, 6: calm-water canvas |
| `art/l-river.jpg` | Seedream 5 Pro | 3: braided river under the six-step board |
| `art/l-ops.jpg` | Seedream 5 Pro | 4: roots and mycelium (AI Operations) |
| `art/l-product.jpg` | Flux 2 Max | 4: glass pavilion in a meadow (AI Product) |
| `art/l-creative.jpg` | Flux 2 Max | 4: Hiva Oa, Marquesas — ATUONA (Creative AI) |
| `art/l-terraces.jpg` | Seedream 5 Pro | 5: terraces behind the "15 services" tile |
| `art/l-failure.jpg` | Seedream 5 Pro | 6: kintsugi river stone |
| `art/l-hills.jpg` | Seedream 5 Pro | 7: misty hills |
| `art/l-close.jpg` | Seedream 5 Pro | 8: stepping stones to an island |

The images are abstract or landscape only, with no people and no text.

**Trap:** a parallel batch of 17 hit Replicate `429` on 12 requests. Below a $5 prepaid balance, Replicate allows 6
predictions/minute. `gen-art.cjs` now starts one request every 11 s and retries a 429.
