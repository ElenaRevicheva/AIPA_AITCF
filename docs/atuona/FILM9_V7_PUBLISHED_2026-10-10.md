# ATUONA — film #9 — v7, PUBLISHED (10 Oct 2026)

Elena: **"Publish the film in highest quality in my film studio but make format of stanzas text bigger and design more like
underground aesthetic style - so that a viewer pays attention not just to a video but to the text as well and the text should
flow, not stand still like being typed on a laptop powershell and in the end of the film should be poems numbers and names
enlisted in a clickable format after when ATUONA name is shown."**

## The text (compile `text_style: 'flow'`, `scripts/atuona-film9.mjs` → `flowAss`)

- **Face:** Syne SemiBold, the display face of atuona.xyz (Google Fonts, OFL; static TTF in
  `C:\Users\kirav\Pictures\Atuona-film9-private\fonts_v7\flow\`). Was DejaVu Serif 33 in a black box band.
- **Size and place:** 78 px (×2.4), lower-left third, no box. Bone white (#F2EEE8) with a thin dark edge, plus a crimson
  (#C0142F) layer offset 5 px right / 3 px down and blurred: a chromatic split, so the text reads as part of the image.
- **Flow:** libass, one event per word. Each word fades in (0.42 s) at the moment the narrator reaches it (timing spread across
  the voice line by word length); the whole stanza drifts 26 px up and 14 px right and opens its letter-spacing while on screen,
  then fades out. Her own verse line breaks are kept; prose stanzas wrap to balanced lines (≤ 38 characters).
- Drawn after the glitch, so the words stay clean while the picture tears.

## The end

The ATUONA title card, then **"POEMS IN THIS FILM"**: all 21 poems as `atuona.xyz/#pNNN` + title (Syne header; rows in
Geologica, the site's title face, so the Russian titles of #047 and #091 show exactly as the vault shows them). A video cannot
carry a tappable link, so the links are tappable in two places: the **film page** on atuona.xyz and the Telegram caption.

## Published

- **Studio feed:** Oracle `cto-aipa/data/atuona/films/out/atuona-2026-10-10T23-24-23.mp4` — the 1080p master itself, not
  re-encoded: H.264 High, 1920×1080, 24 fps, ~13.2 Mbit/s, 158.5 s, 262.1 MB, md5 `70a256f95e7a6467cdd59ab582d53bc4` (laptop =
  Oracle). `GET /cto/films.json` lists it first (9 films); the film URL answers 200, `video/mp4`, `Accept-Ranges: bytes`,
  exact length.
- **Film page:** https://atuona.xyz/aifilmstudio/atuona/ (atuona repo `28eb4b44`, built by Fleek from the push; live check:
  200, 21 poem links, stills 200). Synopsis, logline, credits (engines from the film's own production ledger: keyframes mainly
  Seedream v5 Pro, with GPT Image, Nano Banana Pro, Grok Imagine on Venice; motion Kling O3 Pro on Venice, one shot by Luma;
  voice OpenAI tts-1 onyx; music an original ElevenLabs Music track), three stills from the published master.
- Every film page now links each poem into the vault (Crimson Escape and Could not generate content. too). The studio list,
  root page, llms.txt and sitemap say nine films. Script: atuona `scripts/add-film9-atuona.py`.
- **Telegram:** the 720p phone copy (41 MB) with the studio link, the film page link and the 21 poem links (`ok`, md5 equal).

## Checks

`check_v7.py` → ALL PASS (everything v6 checked + a flowing-text file per shot). blackdetect: 1–2 frame stutters + the fade
into the outro card. Integrated −16.1 LUFS. QC sheet `render_v7\qc_sheet_master.jpg`.

## Undo

Remove `atuona-2026-10-10T23-24-23.mp4` from the Oracle `films/out/` folder (the feed drops it) and revert atuona `28eb4b44`.
