# ATUONA — film #9 — v6 (10 Oct 2026): her whole stanzas, the films' narrator, poem links at the end

Elena on v5: **"put on each shot appropriate stanza from my true content. Now stanzas are torn and inappropriate and put in
the end of the movie number of each poem in a clickable format."** Then: **"cover with voice — voice should be one like in
other movies, music loud but not so much, so that voice and music all fit each other well. Make sure when Mila appears with
Jean — stanza is about Mila."**

## What changed (picture, cut, music C and the flowing glitch are v5's)

- **Text = one WHOLE stanza per shot**, her published English of the ATUONA vault #047–#099 (atuona `metadata/NNN.json`
  `English Text`), split on HER blank lines → `v6_stanza_inventory.json` (709 stanzas, 53 poems). LITPROM #001–#046 is out:
  no source keeps its stanza breaks and it is Russian (a translation is not her verbatim text). Two curators read all 709
  against each shot's frames (one by what the eye sees, one by feeling and the film's arc); 15 of 23 first picks agreed;
  the editor's picks are `v6_picks.json`. `build_cut_v6.py` refuses unless every stanza is verbatim in her text, fits the
  spoken length (words ≤ 2.4 × (shot + 0.5 s)), was not used in films #7/#8 (quote- and case-blind check) and no poem repeats.
- **Mila:** M1, M2, M3, M5 all show Mila with Jean-Marc (frames checked) → stanzas from her Mila poems #082/#083.
- **Voice = the narrator of films #1–#7:** OpenAI `tts-1`, `onyx`, speed 0.9, one take per shot (`render_v6\vo\`). All 23
  takes transcribed back with whisper-1 (`v6_vo_check.py`): every take matches (the only flag, "Ambret", is Whisper's spelling
  of "Ambrette"). Lead 0.5 s, tail 1.2 s: a shot grows past her length only by what its line needs.
- **Mix:** music C at 0.34, gentle duck (ratio 3), voice 1.9, loudnorm −16. **Measured from separated stems:** during speech
  the voice sits **6.2 dB above the music**; between lines the music returns to the voice's level (dips 6.5 dB under speech).
  Integrated −16.1 LUFS. Music (140 s) extended for the 160 s film by the compile's 4 s self-crossfade.
- **End card "POEMS IN THIS FILM"** (7 s): every quoted poem as its deep link `atuona.xyz/#pNNN` (the site's own permalink:
  opens the section and the poem, verified in the live page's `land()` code) with the title the site shows. A video cannot
  hold a tappable link, so the Telegram caption carries the same 21 links as tappable URLs.

## The stanzas

| Shot | Poem | Stanza id | Text (her words, verbatim) |
|---|---|---|---|
| 1a | #092 | S092.16 | "What about the painting?" she asked. "Paradise?" |
| 1b | #072 | S072.6 | Kira stays silent. Knows: don't spook him now. |
| 2 | #048 | S048.7 | The thaw at the end of January had behaved deceitfully, as usual. |
| 6 | #054 | S054.4 | When I drown, / All those who aren't friends, / I'll drag down with me. |
| 7m | #049 | S049.13 | She had to wake up. Kira had to wake up. |
| 9 | #065 | S065.1 | Deep breath, like I'm gathering thoughts from the mist of a Panamanian morning. |
| 10a | #071 | S071.2 | This morning I was looking at notes about Monet. / Light. Repetition. Obsession. |
| 10b | #078 | S078.15 | The universe expands and contracts. / Time folds like origami. |
| 11 | #068 | S068.15 | Is the world still here? / Am I still here? |
| M1 | #082 | S082.3 | He holds her waist like she's another lot with a pre-sale estimate. |
| M2 | #082 | S082.1 | I recognized them immediately — Jean-Marc Dupont with his fiancée, that one from the latest Saint Laurent campaign. |
| 13 | #064 | S064.6 | Kira, baby, I hear your storm inside louder than the one coming outside. |
| 14 | #096 | S096.8 | Just proof that the chain still holds. |
| M3 | #083 | S083.20 | My voice shakes. Mila winces at my fake French like it's cheap perfume. |
| M5 | #082 | S082.4 | I remember Modigliani's line: "When I know your soul, I will paint your eyes." |
| 15 | #047 | S047.2 | Every glance quietly hides as Eternity in the labyrinths of your pupils. |
| 16b | #073 | S073.35 | Ambrette promises warmth that isn't there. |
| 24b | #076 | S076.21 | — Bonhams sells Van Gogh's letters to Theo — pages that were once a way to survive, now lot numbers. |
| 25 | #088 | S088.15 | Ule wiped his face. Salt left white trails on his skin — like maps of countries that don't exist. |
| 30b | #097 | S097.18 | Not a lover. A witness. |
| 31 | #089 | S089.12 | Ule started to say something — and stopped. Not hesitation. Interruption from within. |
| 36 | #091 | S091.23 | "You'll find what you're looking for. But it won't be what you expect." |
| 37 | #095 | S095.8 | I will not whiten. |

## Links (also in the Telegram caption)

- #092 Hungry Earth: https://atuona.xyz/#p092
- #072 Vanilla Network: https://atuona.xyz/#p072
- #048 The Meeting: https://atuona.xyz/#p048
- #054 I'll Drown: https://atuona.xyz/#p054
- #049 French Snow: https://atuona.xyz/#p049
- #065 Atuona: https://atuona.xyz/#p065
- #071 Crimson Escape: https://atuona.xyz/#p071
- #078 Atuona Morning: https://atuona.xyz/#p078
- #068 Digital Exile: https://atuona.xyz/#p068
- #082 Landing: https://atuona.xyz/#p082
- #064 Code Paradise: https://atuona.xyz/#p064
- #096 Nocturnal Silence: https://atuona.xyz/#p096
- #083 Ultramarine Absence: https://atuona.xyz/#p083
- #047 Лабиринты зрачков: https://atuona.xyz/#p047
- #073 Desert Blooms: https://atuona.xyz/#p073
- #076 Composing: https://atuona.xyz/#p076
- #088 Three Notes: https://atuona.xyz/#p088
- #097 The Yellow Christ: https://atuona.xyz/#p097
- #089 The Contract: https://atuona.xyz/#p089
- #091 Код и Холст: https://atuona.xyz/#p091
- #095 The Secret Exhibition: https://atuona.xyz/#p095

## Build, checks, delivery

- Laptop render `render_v6\` (all segments re-rendered: the text is drawn into each). **2:40** (160.0 s), 1080p24, 23 shots
  + 10 flashes, 23 voice lines, 21 poems. `check_v6.py` → **ALL PASS** (whole picked stanza on every shot, Mila rule, every
  voice line placed, end card = every poem quoted, plus all earlier edits). `blackdetect`: only 1–2 frame stutters + the fade
  into the outro card. QC sheet `render_v6\qc_sheet_master.jpg`.
- **Delivered** to her Telegram with the 21-link caption (`ok`, md5 equal laptop/Oracle, uploads removed).
  **Filed:** `D:\ATUONA_FILM9_ALL_MATERIAL_2026-10-08\05_FILM_PREVIEW\v6_2026-10-10\` (the `_nomusic` master there is the silent
  picture: no music and no voice). **Not published** to the gallery: that waits for her go.
- **Money:** voice ~$0.05 (tts-1, ~2.3k characters) + transcription check ~$0.01.
