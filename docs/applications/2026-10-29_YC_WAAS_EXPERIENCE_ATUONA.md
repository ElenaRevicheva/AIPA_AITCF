# Work at a Startup (YC) — Atuona experience entry, actualised 29 Oct 2026

Paste-ready replacement for the Atuona entry in the Work Experience field. Every number below is
verified on 29 Oct 2026 (sources at the bottom). Sister file: `2026-10-29_YC_WAAS_EXPERIENCE_AIDEAZZ.md`.

---

## Paste this

```
Atuona (atuona.xyz) — AI poetry & film studio · founder, full-stack engineer · 2025–present

Atuona is an underground poetry archive and AI film studio I designed and engineer end to end as an
AI-augmented builder (Claude Code, Cursor). AI is the medium, not the author: I own the architecture,
the text and every creative decision; the models render.

What I built and run:

* A creative-AI Telegram agent that turns a poem into AI artwork and AI video. Images run a
  waterfall (Flux 2 Pro → Flux 1.1 Ultra → Pro → Dev, Venice, Imagen); video routes across
  Luma Ray 3.2 (direct API), Runway Gen-4.5, Google Veo 3.1, Kling, Seedance and Wan 3.0 (Venice),
  with the operator able to pin a provider and every clip labelled with the engine that actually
  produced it. A "Director's Cut" pass restyles a finished clip with Luma Modify Video.
* An AI Film Studio (atuona.xyz/aifilmstudio): a server-side FFmpeg compiler that assembles poems
  into finished films — narrator voice (OpenAI TTS, with a free Edge-TTS fallback), score ducked
  under the voice with sidechain compression and loudness normalisation, each clip's length locked
  to its own voice line so text and voice never drift, verbatim stanzas typed on screen as a live
  terminal session, title cards, cross-dissolves, per-clip slow motion with frame interpolation,
  and 2.5D parallax that turns approved stills into moving shots (Depth Anything V2 on CPU, free).
* 9 films published, the latest "AREAREA" (2:41, 1080p, 11 Oct 2026), built from 51 approved
  frames tracked by an md5 manifest so nothing approved is ever re-rendered or overwritten. The
  same pipeline produced 5 client promo films for the commercial lane.
* 99 fragments published: Russian originals with English translation, minted as NFTs on Polygon,
  each film linking back to the poems it quotes.
* Spend control that fails closed: every paid render passes a per-clip budget cap. When a vendor
  changed its quote field, the cap compared against NaN and approved everything — I found it in
  production, fixed it to refuse on a missing price, and published the postmortem as "the vacuous
  guard" on my AI Ops Wiki.
* The website and deploy pipeline (GitHub → 4everland/IPFS), the gallery that reads the film feed
  live from the Oracle Cloud media backend, and the multi-provider media API behind it.

Stack: TypeScript/Node, Python, FFmpeg, ONNX (Depth Anything V2), Luma / Runway / Google Veo /
Replicate / Venice APIs, OpenAI TTS, Polygon NFTs, Telegram Bot API, nginx, GitHub-driven deploys,
Oracle Cloud.
```

---

## What changed against the 28 Oct draft, and the source for each

| Claim | Was | Now | Source |
|---|---|---|---|
| Poem count | 90+ | 99 fragments (LITPROM #001–#046, ATUONA #047–#099) | `curl atuona.xyz` → "99 fragments"; `docs/atuona/2026-10-05_READING_ALL_99_POEMS.md` |
| Film count | not stated | 9, latest AREAREA 2:41 1080p 11 Oct | live `GET /cto/films.json` = 9 entries, newest `arearea-2026-10-11T20-16-33.mp4`; `docs/atuona/FILM9_V12_PUBLISHED_2026-10-11.md` |
| Approved assets | not stated | 51 frames, md5 manifest | `docs/atuona/FILM9_APPROVED_MANIFEST_2026-10-09.json`; memory `project_atuona_film9_approved_assets` |
| Video providers | Luma, Runway, Veo, Kling | + Seedance, Wan 3.0 (Venice); model names; operator pinning; clip labelled by real producer | memory `project_atuona_video_providers`; NOW.md 28 Oct wallet table |
| Image waterfall | not stated | Flux 2 Pro → 1.1 Ultra → Pro → Dev, Venice, Imagen | memory `project_atuona_video_providers`; `src/atuona-image-waterfall.ts` |
| Director's Cut | not stated | Luma Modify Video (`flex_1`) | memory `project_atuona_video_providers` (commit 7a8531c) |
| Voice | "AI voiceover (TTS)" | OpenAI tts-1 onyx 0.9 + free Edge fallback | `src/atuona-film-compiler.ts:213-220`; memory `project_openai_single_point_20261023` (24 Oct) |
| Mix | "atmospheric score" | sidechain ducking + loudnorm, clip length locked to VO | memory `reference_atuona_film_compilation` ("the settings") |
| Stanzas on screen | "burned-in stanzas, monospace title cards" | typed as a terminal session (v10, 11 Oct) | `docs/atuona/FILM9_V10_PUBLISHED_2026-10-11.md` |
| Still-motion | not stated | Depth Anything V2 Small ONNX, 2.5D camera, CPU, free | memory `reference_atuona_film_compilation` (film #7, 21 Sep) |
| NFT chain | "on-chain" | Polygon | `docs/atuona/ATUONA_BOOK_ROADMAP.md:309` (PolygonScan contract) |
| Fail-closed spend cap | not stated | Venice quote `{"quote":0.52}` vs `price_usd` → NaN → failed open; fixed; wiki concept `vacuous-guard` | memory `project_atuona_video_providers` (22 Sep); `aideazz/content/ai-ops-wiki/concepts/vacuous-guard.md` |
| Client promo films | not stated | 5 films (AI Growth Operator series, 1–3 Oct) | memory `reference_atuona_film_compilation` (Make rotation of 5) |

**Not claimed, deliberately:** YouTube/Instagram/Niio distribution of AREAREA (kit drafted 12 Oct,
publication not verified); Sora/Pixverse/Hailuo lanes (wired via Replicate, not exercised in a
published film); any revenue.
