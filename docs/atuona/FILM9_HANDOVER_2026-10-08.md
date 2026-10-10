# ATUONA — film #9 — HANDOVER: how this film was made, and how to continue (5–9 Oct 2026)

Written by the Claude Code session that built it, at Elena's request ("create … a file explaining all this session film
creation process so that other session agent can easily continue if something happens"). Checked by two independent
read-only reviewers (a fresh-agent resume test + a fact-check; findings in `docs/atuona/film9_stanza_work/handover_review.json`)
and corrected. Copies: `D:\ATUONA_FILM9_ALL_MATERIAL_2026-10-08\00_HANDOVER_FOR_NEXT_AGENT.md` (laptop) and
`docs/atuona/FILM9_HANDOVER_2026-10-08.md` (repo `main`). Also read `docs/oracle/NOW.md` (the shared session board).

---

## 0. READ FIRST — where it stands

> **10 Oct 2026 — v2 cut built from Elena's own edit.** She watched the 8 Oct preview and named 27 screenshots with the
> action (removed / shorter / much shorter / make a (short) glitch / "when the image stops moving remove") plus three
> "add this shot" clips and four "make a glitch from the image" stills, in
> `02_APPROVED/09.10.2026 shots to be removed from the film/`. Every screenshot was tied to its shot by playhead time +
> on-screen stanza (27/27 double-verified), the clips/stills by md5. Result: `docs/atuona/FILM9_V2_EDIT_2026-10-10.md`
> (the table, the decisions, the files). 24 shots + 10 flashes, 2:16, **no voice** (`FILM9_NO_VO=1`; a shot cannot be
> "much shorter" while stretched to its voice line), music bed kept + a no-music variant. Her verdict on the 8 Oct shots is
> now explicit: 13 removed (5 1c 7 17 18 21 24 26 27 28 30 32 34), 5 turned into flashes (M4 19 20 20b 35), 8 shortened.
> Cut `film9_stanza_work/cut_v2_2026-10-10.json` (`build_cut_v2.py`), build folder `…\Atuona-film9-private\render_v2\`.
> Everything below describes the 8 Oct preview and still applies to recipes, paths and money.

- **Elena watched the preview (8 Oct): "film is ugly. Music is ugly. Only few shots are more or less good."**
- **Music and voice are ON HOLD by her word** ("Stop with a music for now", "Stop with this for a while"). Do not resume
  them unasked. ⚠️ The compile as written ALWAYS mixes all 39 voice lines and the deep-house track — a rebuild without them
  needs a small code change (§4.6) → Teach → Plan → Confirm with her first.
- **Her next move:** say which shots are good. **Nothing is to be built or spent until she does.** If she names numbers,
  check which numbering she means (§3.1).
- **Everything generated** (approved or rejected) is in `D:\ATUONA_FILM9_ALL_MATERIAL_2026-10-08\` (`00_README.md`,
  `MD5SUMS.txt`, folders 01–10). Exceptions noted there: Oracle `raw/` (API request logs) is not copied; six EMPTY folder
  entries left by the copy were removed; Oracle `~/atuona-film9/work/` (the failed Oracle preview pieces, 1.1 GB) was
  deleted on 9 Oct after a byte-for-byte md5 match with `09_BUILD_INTERMEDIATES/oracle_preview_attempt/` (it was created
  in this session and the disk was full).
- **Money left:** Venice **$12.61** (read from the Venice API 9 Oct ~00:03 UTC — §5 shows how). Replicate ~$10.27 spent
  of her prepaid. OpenAI (voice) cents. She has said she has no more money — never spend without her explicit go.
- **Oracle:** root disk **98% full (1.4 GB free after the cleanup above)** — run `df -h /` before ANY write there
  (gen.mjs, scp). Other cleanup candidates need HER go (§8). **NEVER render video on Oracle** (§8: on 8 Oct a one-pass
  ffmpeg froze it and every bot went down). Build on the laptop.
- Oracle's old compile is renamed `film9.mjs.OLD-froze-oracle-2026-10-08-DO-NOT-RUN` — the only compile is the repo's
  `scripts/atuona-film9.mjs`, run on the laptop.

---

## 1. What the film is

- **Title ATUONA**, Atuona film #9, made for **Niio's private-viewer programme**. From her poems: the ATUONA vault
  (#047–#099, mostly English — but **#059, #093, #094 are Russian**) and LITPROM (#001–#046, Russian) —
  `content/poems.json` in the `atuona` repo (copy `docs/atuona/poems_src/poems_github_2026-10-08.json`).
- Story/shots: `docs/atuona/FILM9_ATUONA_SCENARIO_v3_2026-10-06.md`; Mila & Jean-Marc arrival
  `docs/atuona/FILM9_MILA_JEAN_SEQUENCE_2026-10-07.md` (poems #082–#086).
- Length: 4:30 planned (`docs/atuona/FILM9_LENGTH_DECISION_2026-10-07.md`); the preview ran **5:24** (slow voice) — her call.
- **Cast (locked faces, `img/` on Oracle, also `02_APPROVED/cast/`):**
  - **Kira** (`kira.jpg`): about 34, grey-green eyes, faint healed scar through the left eyebrow, **a lesbian**. In the
    film frames her hair is **true black, long, wavy — not curly** (`kira_hair_v3`); only the cast portrait has curls. Say
    "true black, never blue" (else navy).
  - **Ule** (`ule.jpg` = "Ule #2"): **a man**, Norwegian, about 47, light ash-blond, pale blue eyes, sexy and rich — Kira's
    witness, **never her lover**.
  - **Mila** (`mila.jpg`): a model — beautiful, **not skinny**; changes clothes through the film.
  - **Jean-Marc** (`jean.jpg` = "L3"): Black French, sexy, masculine, dreadlocks half-up, trimmed beard; luxurious bohemian
    art-collector / crypto-trader wardrobe.

## 2. Elena's rules (each came from a shot she rejected)

Creative:
1. **Highest quality, super-realistic** — never pick an engine on price; test **Venice first**. Nothing may look painted,
   CGI, airbrushed or HDR.
2. **Surrealism = impressionism**: colour, light, weather, glitch, atmosphere, poetic association — never creatures,
   statues, birdcages or props *we* invent. **Her own** transformation ideas are in (shot 24: Ule's tears turn into auction
   lots as they fall).
3. **Kira is a lesbian**: no Kira/Ule kiss, sex scene, nuzzle, lips or nose on skin — "recognition, not seduction". Erotic =
   implied (wet silk, bare backs, shoulders), never explicit, nothing frontal below the collarbones.
4. No flowers dropped into frames. Characters change clothes.
5. No real-person likeness (she asked for the singer Seal → declined; Venice terms forbid it). No brand names in prompts
   (models paint logos) — a brand may live in her stanza.
6. A provider refusal is final — no wording to beat a filter; redesign only with her OK.
7. **Text = her true content**: one **sharp stanza per shot** from her own poems, chosen to fit **emotionally**, not the
   plot. Her English verbatim; Russian → **atmospheric English** keeping every image and adding nothing. Cards say
   "Fragments", never "Moments".
8. Music she asked for: deep house, underground aesthetic — the generated one she called ugly; on hold.

Process:
9. **Never wipe/overwrite** what you did not create in your session; approved files keep their names forever. Guard:
   `docs/atuona/FILM9_APPROVED_MANIFEST_2026-10-09.json` (51 clips incl. v24La/v24Lb/sm_k34/sm_k36). The older
   `…_2026-10-08.json` captured sm_k26/sm_k30 mid-render — its md5s for those two do not match; that is NOT an overwrite.
10. Erotic stills never go into a public repo (AIPA_AITCF is public until ~20 Nov 2026) — they live in
    `C:\Users\kirav\Pictures\Atuona-film9-private\` and the ALL-material folder.
11. Oracle / `main` / PM2 changes: Teach → Plan → **Confirm** → Build → Document. Stage named files only. Push NOW.md to `main`.
12. Address her as **Elena** (never "bro"); end with the named concept in plain words.

## 3. Where everything is

**Oracle** (ssh alias `oracle-cto-aipa`), `~/atuona-film9/`:
| Path | What |
|---|---|
| `gen.mjs` | generator: `node gen.mjs image <id>` · `video <shotId> venice` · `music <id>` · `ledger`. **Only copy on Oracle + a backup in `10_GENERATOR_PLAN_LEDGER/`.** |
| `plan.json` | every prompt (`images`, 187 entries), every motion shot (`shots`, 43), `final_frames_4m30` (the APPROVAL list), `glitch_approved`, `music`, `motion_look`, `negative`. Backups `plan.json.bak-*`. Copy in `10_…`. |
| `ledger.jsonl` | every paid call. Copy in `10_…`. |
| `img/` 274 · `clips/` 48 · `stillclips/` 10 · `music/` 2 · `vo/` (first voice take) · `qc/` · `sm/` (depth maps + specs) · `raw/` (request logs) | |
| `film9_*.py` | plan scripts — write them in `docs/atuona/`, `scp`, run with `python3` (ssh quoting breaks otherwise). |
| `send_preview_tg.sh` | sends a video to Elena via `@aitcf_aideazz_bot` (`TELEGRAM_BOT_TOKEN` + `CONCIERGE_TG_CHAT` from `~/cto-aipa/.env` — those keys exist only on Oracle). |

**Laptop:**
| Path | What |
|---|---|
| `D:\ATUONA_FILM9_ALL_MATERIAL_2026-10-08\` | EVERYTHING sorted: 01 stanzas · 02 approved · 03 all images · 04 all clips · 05 preview · 06 music · 07 voice · 08 sheets · 09 build pieces · 10 generator/plan/ledger/specs. |
| `C:\Users\kirav\Pictures\Atuona-film9-private\APPROVED_2026-10-08\` | md5-verified copy the laptop build READS (`clips/` = 41 film clips + v24La/Lb; the s13* bake-offs are only on Oracle and in `04_ALL`; `stillclips/`, `img/` approved names, `music/`). |
| `…\Atuona-film9-private\render_local\` | laptop build: `work/` (preview.mp4, segments, `timeline.json`, `fonts/*-nl.ttf`), `vo/` (the voice take used). |
| `…\Atuona-film9-private\frames_final\` | the frames as `NN_shot.jpg` (same as `02_APPROVED/frames_in_film_order/`). |

**Repo** (`D:\aideazz\ai-cofounders\cto-aipa`): `scripts/atuona-film9.mjs` (compile), `scripts/atuona-film9-vo.py` (voice),
`scripts/atuona-still-motion.py`, `docs/atuona/film9_stanza_work/` (`corpus_numbered.txt`, `slots.json`, `picks.json`,
`picks_verified.json`, `verify_picks.py`, `translate_workflow.js`, `translations_judged.json`, `stanzas_final.json`,
`clip_choice.json`, `build_cut.py`, `cut.json` = the exact cut of the 8 Oct preview, `frames_map.txt`, QC JSONs).
Memory: `project_atuona_film9_approved_assets`, `feedback_no_heavy_renders_on_oracle`, `feedback_atuona_film_style`,
`feedback_atuona_surrealism_is_impressionism`, `feedback_film_engines_quality_venice_first`.

### 3.1 Three numberings — say which one you mean
- **Shot id** (canonical): `1a 1b 1c(card) 2 5 6 7m 7 9 10a 10b 11 M1 M2 13 14 M3 M4 M5 15 16b 17 18 19 20 20b 21 22 24 25 26
  27 28 30 31 32 34 35 36 37` — this is `build_cut.py ORDER`, the real film order (7m BEFORE 7; 20b its own shot).
- **Position NN** in `02_APPROVED/frames_in_film_order/` (01–39, no card): e.g. `14_13.jpg` = shot 13 = `k13`;
  `37_35.jpg` is a copy of `k36` (35 is a double exposure of 36). Map: `frames_map.txt` (NN_shot → image). The red-dog
  plate `k17b` is not in that folder (it is in the manifest and `03_ALL_IMAGES`).
- **Section number** in `01_STANZAS/FILM9_STANZAS_2026-10-08.md` (1–40; card 1c is section 3).
- Image names differ from shot ids: 7=k07b, 7m=k07m, 16b=k16m, 25=k25m, 28=k28m, 32=k32m, 35=k36.
- "The shot at 2:10" → `render_local/work/timeline.json` (start/duration of every shot in the 8 Oct preview; copy in `10_…`).

## 4. The pipeline (what was done, and the exact recipe to redo or change any step)

### 4.1 Frames
- Engine standard (blind panel): **Venice `seedream-v5-pro-edit`** ($0.08, refs = cast faces). Others: `seedream-v5-pro`
  ($0.11, text-to-image), `nano-banana-pro-edit` ($0.23, Google filter, drifts night→dusk), `qwen-edit-uncensored` ($0.04,
  1500-char cap, glossy). ⚠️ gen.mjs uses `flux-2-max-edit` when refs are given without a `vmodel` — always set
  `"engine":"venice","vmodel":"seedream-v5-pro-edit"`.
- **New frame recipe:** `cp plan.json plan.json.bak-pre-<id>-<date>`; add `plan.images[<NEW id>]` (never an existing id) via a
  `docs/atuona/film9_<what>_<date>.py` script (scp + python3); `df -h /`; `BUDGET_USD=<ledger total + approved $>
  VENICE_BUDGET_USD=<venice total + approved $> node gen.mjs image <NEW id>`.
- `final_frames_4m30` = the approval list (39 = 38 shot frames + k17b; it lists 7 and 20 twice) — the SEQUENCE is
  `build_cut.py ORDER`. Aliases (same bytes): 9=k09_noflower, 10a=k10a_nf, 11=k11g, M1=M1i, M2=M2i, 13=k13_dusk_1006,
  M3=M3j, M4=M4j, M5=M5f, 15/22/24 = their `_real` versions, 30=k30i, 31=k31i.
- Realism pass: k15s_real, k22_real, k24_real were made first and **approved**; a later pass on 26 more frames ($2.08)
  produced nothing approved (k37_real added a person) — 29 `_real` images in all.
- Glitch inserts approved 7 Oct: **G6s** (storm sea inside the emerald), **G7** (night sea reflects a day sky), **G8_clean**
  (alone in the mirror); G1/G4 rejected (Kira is a lesbian), G2/G3/G5 rejected. Crimson method (`makeGlitch()`): ~1.2 s,
  0.1 s cut, RGB split, torn band, grain. In the cut: G7 after 7, G8 after 11, G6 after 14.

### 4.2 Motion
- **Venice Kling O3 Pro** `kling-o3-pro-image-to-video`: $0.77 / 5 s, $1.54 / 10 s, 1080p, same face hold as 4K. 4K
  (`kling-o3-4k-image-to-video`, $2.31 / 5 s) only for shot 13 — that take (`v13__venice-kling-o3-4k.mp4`) is in the cut.
- Directions: `docs/atuona/film9_motion_directions_2026-10-08.json`; painterly similes removed in
  `film9_motion_run_2026-10-08.py`. Full run: 36 clips, $44.66, 0 failures (batch form: `run_motion.sh` + `motion_run_ids.txt`).
- **⚠️ RE-TAKE RECIPE (never re-run an existing shot id — gen.mjs OVERWRITES `clips/<id>__<tag>.mp4`):**
  1. `cp plan.json plan.json.bak-pre-<id>r2-<date>`; a script copies `plan.shots['v15']` to a NEW key `v15r2` (with the
     motion change she approved); scp + `python3`.
  2. `node gen.mjs ledger` → note the totals. Caps are **cumulative ledger caps**, not per run (default BUDGET_USD = 30 →
     everything refused).
  3. `df -h /`, then: `cd ~/atuona-film9 && nohup env VENICE_VIDEO_MODEL=kling-o3-pro-image-to-video
     VENICE_OMIT=aspect_ratio,resolution BUDGET_USD=<total + approved $> VENICE_BUDGET_USD=<venice total + approved $>
     node gen.mjs video v15r2 venice > logs_motion/v15r2.log 2>&1 &` (polls up to 20 min; without VENICE_VIDEO_MODEL it
     silently uses wan-3-0 at another price).
  4. QC at **full resolution** (low-res contact sheets lie — second looks at 1080p overturned rejects of 31 and 30).
  5. Into the laptop build: `scp oracle-cto-aipa:atuona-film9/clips/v15r2__venice-kling-o3-pro.mp4
     C:/Users/kirav/Pictures/Atuona-film9-private/APPROVED_2026-10-08/clips/`, compare `md5sum` both ends, add it to
     `04_ALL_VIDEO_CLIPS` + `MD5SUMS.txt`, set `clip_choice.json["15"].clip` (+ trim/end), rebuild the cut, `--reuse --reseg=15`.
- Kling failure modes seen: identity drift after ~4–5 s in 10 s clips; lips moving (reads as speech); Kira's nose/lips
  closing on Ule; straps slipping; objects appearing (pearl flakes in the footprint); flat painterly colour washes.
- QC: `docs/atuona/film9_stanza_work/qc_first_pass.json` (first pass + 7 second looks; 16 second looks never ran — session
  limit). Decisions: `clip_choice.json` (PASS / TRIM / REVIEW / REJECT → still-motion).
- **REVIEW clips she has not judged** (per `clip_choice.json`): 1b (his breath shows as white vapour), 2 (frontal reflection
  meets her face), 6 (a face under the water after 9 s — cut at 9 s), M1 (Jean-Marc's smirk → grin), M2 (Kira's face a
  little narrower; Jean-Marc looks down at Mila's wrist), M3 (cracks spread and darken), M4 (his fist lines up over her
  hand), 15 (Ule's mouth opens and closes), 30 (v30: her eyes close at his jaw — the cut uses still-motion instead).
  `v24` (look hardens) is kept, unused.
- **Shot 24 (her idea):** `v24La` (tear → gilt-framed painting, tear → emerald; face holds) + 1 s dissolve into the end of
  `v24Lb` (lots on black velvet under saleroom spotlights).
- **Still-motion ($0, face cannot drift):** film #7's tool (`scripts/atuona-still-motion.py`, Depth Anything V2 parallax +
  light/rain/shimmer). The 8 Oct clips 7, 20, 22, 25, 26, 30, 34 (+ base of 35, and 36's tail) were rendered **on Oracle**
  (`run_sm.sh`: `~/atuona-film7/venv/bin/python still_motion.py render sm/specs/<name>.json`, model
  `~/atuona-film7/models/depth_anything_v2_small.onnx`). Under the no-render rule, new still-motion goes on the LAPTOP —
  its venv (needs onnxruntime + opencv; the laptop has opencv only) and the model are not set up there yet; set that up, or
  get Elena's explicit go for one nice'd render on Oracle after `df -h /` + `free -m`. Specs hardcode `out:
  stillclips/sm_<name>.mp4` — always write to a NEW name (`sm_<name>_v2.mp4`). Specs: `10_…/still_motion_specs/`.

### 4.3 Stanzas
- Corpus → `corpus_numbered.txt`; films #7/#8 stanzas excluded (`avoid_used_in_films_7_8.txt`).
- Curation workflow (3 curators: inner voice / sharpest lines / film as one poem; then an editor) → `picks.json` →
  **`verify_picks.py`** (39/39 her exact text; 32 poems; 17 RU / 22 EN).
- Translation workflow (`translate_workflow.js`: 2 translators atmospheric/close → judge with image map → whole-film critic)
  → `translations_judged.json` → critic fixes → **`stanzas_final.json`**.
- **Change-a-stanza recipe:** back up `picks.json` + `stanzas_final.json`; edit slot `<sid>` in both (English = her text
  verbatim from `poems_github_2026-10-08.json`; Russian = atmospheric English, nothing added); run
  `python docs/atuona/film9_stanza_work/verify_picks.py` from the repo root (it checks `picks.json` only — re-read the
  English by eye); rebuild `cut.json`; if voice is used, move `render_local/vo/<sid>.mp3` to `vo/_replaced/` first (the
  voice script skips existing files) and re-voice only with her go; rebuild with `--reuse --reseg=<sid>`; update the
  readable doc in `01_STANZAS/` (no generator — edit by hand).
- Card 1c = her line from #053 ("I'm a lesbian. / Please consider this for possible group activities.").

### 4.4 Voice (ON HOLD)
- `scripts/atuona-film9-vo.py`: OpenAI `gpt-4o-mini-tts`, voice **marin** (Kira: low, husky, slight Russian accent). Costs
  OpenAI money → only with her go. Laptop command (Git Bash, repo root):
  `cd /d/aideazz/ai-cofounders/cto-aipa && PATH="$FB:$PATH" FILM9_ENV=D:/aideazz/VibeJobHunterAIPA_AIMCF/.env
  FILM9_CUT=<cut.json> FILM9_VO=C:/Users/kirav/Pictures/Atuona-film9-private/render_local/vo python scripts/atuona-film9-vo.py`
  (`FILM9_VO` MUST be `<FILM9_WORK>/vo` — the compile reads voice there; `$FB` = static-ffmpeg dir, §4.6).
- The preview voiced all 39 — wall-to-wall talking; likely part of "ugly".

### 4.5 Music (ON HOLD)
- `node gen.mjs music <id>` = ElevenLabs music on Replicate ($0.011/s; 300 s max ≈ $3.30). `film9` (ambient, measured no
  beat) and `film9_deephouse` (measured 118 BPM four-on-the-floor) — she called it ugly. I cannot listen: measure with
  `docs/atuona/film9_stanza_work/music_check.py`. Earlier films' tracks: memory `reference_atuona_film_compilation`.

### 4.6 Compile (LAPTOP ONLY)
- **Shot list:** `ORDER` in `docs/atuona/film9_stanza_work/build_cut.py` (+ `GLITCH_AFTER = {7: G7, 11: G8_clean, 14: G6s}` —
  dropping one of those shots silently drops its glitch; `cover: '1a'` must be a kept shot; date '08.10.2026' hardcoded).
  Run from the repo root: `python docs/atuona/film9_stanza_work/build_cut.py` → overwrites `cut.json` (committed copy =
  the 8 Oct preview). **Tighter-cut recipe:** copy it to `build_cut_tight.py`, set ORDER to her shots, keep/reassign the
  glitches (ask her), set cover, write `cut_tight_<date>.json`, pass it as `FILM9_CUT`, use a NEW `FILM9_WORK` folder (copy
  `work/fonts/` into it) so the watched preview is not overwritten.
- `scripts/atuona-film9.mjs`: 1920×1080 / 24 fps; voice locked to its shot (LEAD 0.7 + voice + TAIL 1.9); 1.3 s dissolves;
  stanza band at the bottom (DejaVu Serif 33); mono cards; glitches with a 0.1 s cut; music ducked + loudnorm. Special
  shots: 5 reversed, 17 red dog keyed (no shadow), 24 A→B dissolve (`tail`), 35 double exposure of 36, 36 clean 4 s walk →
  still-motion tail, `trim`/`end` windows from QC. Dissolves run in batches of 6 with a free-memory check; music shorter
  than the film is extended by a 4 s self-crossfade.
- ⚠️ **No switches yet** for: no voice (it throws "missing voice"), no music (always mixed), no text (a shot without a stanza
  would burn the word "undefined"). Adding e.g. `FILM9_NO_VO=1`, `FILM9_NO_MUSIC=1`, text only when `it.stanza` is set =
  a repo code change → Teach → Plan → Confirm with her.
- **Laptop command** (Git Bash, from the repo root; ffmpeg from pip `static-ffmpeg`; fonts `*-nl.ttf` = DejaVu with the
  newline mapped to zero-width because ffmpeg 8 draws `\n` as a box). PREVIEW takes ≥5 min → run in the background and
  tail the log; the master (no `PREVIEW`, minterpolate) takes much longer:
  ```bash
  cd /d/aideazz/ai-cofounders/cto-aipa
  FB=/c/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32
  R=C:/Users/kirav/Pictures/Atuona-film9-private/render_local
  PATH="$FB:$PATH" PREVIEW=1 FILM9_BASE=C:/Users/kirav/Pictures/Atuona-film9-private/APPROVED_2026-10-08 \
    FILM9_WORK=$R FILM9_CUT=D:/aideazz/ai-cofounders/cto-aipa/docs/atuona/film9_stanza_work/cut.json \
    FILM9_FONT=$R/work/fonts/DejaVuSerif-nl.ttf FILM9_MONO=$R/work/fonts/DejaVuSansMono-nl.ttf \
    node scripts/atuona-film9.mjs [--stanza-preview | --reuse --reseg=<every changed shot id>] > $R/build.log 2>&1
  ```
  `--reuse` reuses segments by shot id only — list EVERY shot whose clip, trim or stanza changed in `--reseg`.
- **Deliver to her phone:**
  1. `"$FB/ffmpeg.exe" -y -i $R/work/preview.mp4 -vf scale=1280:720 -c:v libx264 -preset veryfast -b:v 1000k -maxrate 1400k
     -bufsize 2800k -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart $R/work/ATUONA_film9_<label>_<date>_phone.mp4`
     (Telegram bot limit 50 MB; for films longer than ~5:30: video kbps ≈ 48×8192/seconds − 96).
  2. `ssh oracle-cto-aipa 'df -h /'` → `scp <file> oracle-cto-aipa:atuona-film9/`
  3. `ssh oracle-cto-aipa 'cd ~/atuona-film9 && ./send_preview_tg.sh <file> "<caption>"'` → expect `ok`; then remove the
     uploaded copy (you created it). Say in the caption what is still on hold (voice/music).
  Never publish to `~/cto-aipa/data/atuona/films/out` (the PUBLIC gallery) without her explicit go.

## 5. Money
- Venice: $85.82 spent on film #9 in total (250 image calls; 48 video calls = 45 delivered + 3 failed at $0 on 7 Oct); her
  $77 top-up on 7 Oct; **$12.61 left**. Read it: on Oracle, `curl -s https://api.venice.ai/api/v1/api_keys/rate_limits -H
  "Authorization: Bearer $VENICE_API_KEY"` → `data.balances.USD` (key in `~/cto-aipa/.env`).
- Replicate: $10.27 (4 images, 6 video calls of which 3 delivered — the 6 Oct bake-off, 2 music tracks).
- Prices: Kling O3 Pro re-take $0.77 (5 s) / $1.54 (10 s); Seedream frame $0.08; music $3.30; still-motion $0.

## 6. Workflows used (Claude Code `Workflow` tool)
Motion directions `wf_7aa00698-68e` · text verify + realism QA `wf_e46cad57-c1d` · stanza curation `wf_578928ba-711` ·
translation `wf_367b0fdc-86a` · motion QC `wf_19e30657-7af` · handover check `wf_64ef9644-c42`. `resumeFromRunId` works only
in the SAME Claude session — a new session must re-run (inputs are in `film9_stanza_work/`). Workflow scripts must be
LF-only (a CR makes the launcher refuse).

## 7. Open decisions (all hers)
1. Which shots are good → a tighter cut from those (re-takes $0.77 each, or still-motion $0 once set up on the laptop).
2. Music: real tracks she picks by ear, or a new brief — on hold.
3. Voice: key stanzas only / none / all — on hold (needs the compile switch in §4.6).
4. Length: 5:24 vs the 4:30 plan.
5. The REVIEW clips in §4.2.

## 8. Incidents and lessons (do not repeat)
- **8 Oct: Oracle frozen about 50 minutes.** The preview build started 20:46 UTC; one ffmpeg dissolve chain over ~45
  full-HD inputs reached 9.2 GB RSS on the 12 GB box with no swap; logging stopped ~20:55; SSH and every endpoint were dead
  until the kernel OOM-killed ffmpeg; back 21:41 (no reboot). No OCI API config on the laptop; the safety layer correctly
  refused using her cloud key. **Heavy renders on the laptop only.** After any Oracle trouble verify: ports
  3000/8081/8080/18789/3001 = 200, `pm2 jlist`, `systemctl is-active espaluz-whatsapp espaluz-familybot espaluz-influencer
  vibejobhunter vibejobhunter-web`, and **`systemctl --user is-active openclaw-gateway`** (OpenClaw is a systemd --user unit).
- **Oracle disk** (9 Oct): 98%, 1.4 GB free. Candidates that are NOT ours — delete only with Elena's go:
  `/tmp/vjh-test-20261006` 1.3 GB (VJH test copy, 6 Oct) · `/tmp/demucs_*` ~1.1 GB (promo-film music stems, 2–3 Oct) ·
  `/tmp/atuona-hd` 604 MB (HD copies of films #7/#8, 25 Sep) · `~/.cache` 1.0 GB · `/tmp/qrvenv` 237 MB.
- Never import `dist/atuona-creative-ai.js` (starts a second Atuona bot). node `fetch` hangs on Oracle → `curl`.
- `tar --transform` leaves empty directory entries; ffmpeg 8 draws a newline as a box; Windows paths inside ffmpeg filters
  need relative paths (`fp()` in the compile); the laptop memory threshold is 800 MB (Oracle 2500).
- Rejected, so not proposed again: the generic AI deep-house track; voice on every stanza; flowers; statues/birdcages as
  surrealism; Seal; G1/G4.
