# AI Growth Operator — 8-page client deck (October 2026)

**Deliverables:** `AIdeazz_AI_Growth_Operator_2026.pdf` (English) and `AIdeazz_AI_Growth_Operator_2026_ES.pdf` (Spanish) — 16:9,
8 pages, ~4.8 MB each (under the 5 MB outreach-attachment cap), selectable text, 5 clickable links (email, free audit at
aideazz.xyz/api, WhatsApp, portfolio, AI Ops Wiki). Copies `…_EN.pdf` / `…_ES.pdf` sit in Elena's Desktop `2 Decks 01.10.2026`
folder; the old 29 Sep 7-slide deck was moved to its `old/` subfolder (not deleted).

**Website (LIVE 1 Oct 2026):** aideazz.xyz/api footer, right under "About": **"AI Growth Operator"** opens
`aideazz.xyz/AIdeazz_AI_Growth_Operator_2026.pdf` (EN) or `…_ES.pdf` (ES) by page language (`labApi.aigoDeckHref` in the aideazz
`en.json` / `es.json`, commit `c00d3c9`). **After a rebuild, copy both PDFs to aideazz `public/` too**, or the site keeps serving
the old deck. Verified: live files byte-identical to the built ones.

**Spanish edition:** `python make-es.py` builds `aigo-es.html` from an explicit EN→ES pair list and FAILS on any untranslated
string. Formal "usted". "AI Growth Operator" stays the product name. Spanish-only size tweaks live in that script.

**Content source:** Elena's two files of 28–29 Sep (`28.09.2026 AI Growth Operator.pdf` notebook + the 7-slide dark deck), read
in full and evaluated in `EVALUATION.md` — what was kept, what is internal only, what is personal data, what is unproven.
Brand = AIdeazz AI Lab (client-facing; not Elena's CV). No client results are claimed: slide 6 is our own system, labelled so.

**Design:** the Professional Outlook system (`docs/applications/professional-outlook/`) — Lexend Deca, HubSpot-style cards,
tags and board, light naturalistic photography — with **its own images** (`art/`, prompts in `art-jobs.json`).

| Slide | Content | Image |
|---|---|---|
| 1 | Cover: "We install AI growth operators for service businesses." + 4 verified stats | `a-cover` lighthouse (Nano Banana Pro) |
| 2 | Where customers get lost: AI search → inquiry → follow-up → CRM | `a-fog` paths in fog (Seedream 5 Pro) |
| 3 | Not another CRM: software / features / traffic vs outcomes | `a-canvas` dunes (Flux 2 Max) |
| 4 | What gets installed: 6-step loop + "nothing goes out without you" | `a-loop` river meander (Seedream) |
| 5 | Who it is for: 6 checks, 4 niches, not-a-fit | `a-clinic` `a-city` `a-stones` `a-yacht` (Seedream) |
| 6 | Proof: we run it on ourselves first | `a-orchard` (Seedream) |
| 7 | How we start: free audit → diagnostic → install & manage | `a-pier` (Seedream) |
| 8 | Close + contacts | `a-harbour` (Seedream) |

**Numbers:** verified floors from the same CV sources as the Outlook deck, counted 28–29 Sep 2026. Re-count before reusing in
November. Never add client results, "installed in 14 days", or per-niche revenue figures until they are real.

## Rebuild

```bash
python make-es.py && python render.py   # needs Chrome or Edge, Pillow, PyMuPDF; fonts are local
```

Art (one-off, on Oracle, from `~/cto-aipa`):
`NODE_PATH=$HOME/cto-aipa/node_modules node ~/aigo-art/gen-art.cjs ~/aigo-art/out ~/aigo-art/art-jobs.json [name]`
with `gen-art.cjs` copied from the Outlook folder. **Trap:** Flux 2 Max flagged "white river stones" as sensitive (E005, a false
positive) — `a-stones` was regenerated on Seedream.
