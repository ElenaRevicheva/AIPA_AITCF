# Atuona AI Film Studio — Film Compilation Guide

**How to compile Telegram-downloaded Atuona clips into a published film, step by step, with every error we already paid for.**

Films produced with this pipeline:

| Date | Film | Script | Music (Pixabay) |
|---|---|---|---|
| 17.06.2026 | *Between Compile and Run* | `scripts/atuona-film-final.mjs` | Light In The Void (Dark Cinematic Ambient) |
| 19.06.2026 | *Stanzas* | `scripts/atuona-montage.mjs` | Fatal Error |
| 02.07.2026 | *The Secret Exhibition* | `scripts/atuona-film3.mjs` | Dark Cinematic Drone Deep Bass Ambient |
| 03–04.07.2026 | *Reprint* · *Recovered* | work dirs `atuona-film4/5` on Oracle | Melancholic Ambient (Universfield) · Atmospheric Dark Cinematic |
| 21.09.2026 | *Could not generate content.* (working title *Paradise Is Compiled*) — 19 clips **+ 20 stills turned into video shots** | `scripts/atuona-film7.mjs` + `scripts/atuona-still-motion.py` | Red Lips (Sensual Noir Lo-Fi Beat) — WBM Studio |
| 22.09.2026 | *Crimson Escape* (film #8, 3:53) — **18 NEW generated video shots + 2 glitch inserts** (poems drawn from ATUONA + LITPROM) | `scripts/atuona-film8-gen.mjs` + `scripts/atuona-film8-vo.py` + `scripts/atuona-film8.mjs` | The Ritual — Tribal Trap Fusion (Saturn-3-Music) |

The canonical, most current reference is **`scripts/atuona-film7.mjs`** (film3's pipeline + stills-as-shots,
gallery walls for vertical stills, motion-interpolated slow-mo, verify-before-publish). For clips-only films
`scripts/atuona-film3.mjs` is still the simplest start: change the constants at the top and run.
Never re-invent the ffmpeg chains: every setting below was a real iteration. Film #7's full record
(file→poem evidence, translations, stanza table): `docs/atuona/FILM7_PARADISE_IS_COMPILED.md`.

**To make a film from NEW generations instead of existing clips** (film #8): §5c, scripts `atuona-film8-*`, record
`docs/atuona/FILM8_2026-09-22.md`, every prompt in `docs/atuona/film8-plan.json`. Engine pins + which accounts are
funded: `docs/atuona/2026-09-22_MODEL_AUDIT_AND_TOPUPS.md`.

**To make a client promo film** (the AI Growth Operator series: yacht, /api, villa + charter, relocation, 01–02.10.2026):
§5f has the 4 films with their scripts, masters and links, plus the pipeline from an 8-agent plan to the YouTube upload. Newest
reference: `scripts/reloc-*`. Upload sheet: `docs/selling/video/2026-10-01_AIGO_YOUTUBE_UPLOAD_SHEET.md`.

---

## 0. Where everything lives

- **All compilation runs on Oracle** (`ssh oracle-cto-aipa`) — it has `ffmpeg` 6.1.1, `ffprobe`,
  the fonts, and the published-films directory. Windows has no ffmpeg.
- Work dir per film: `/home/ubuntu/atuona-<name>/` with `clips/`, `work/`, `vo/` subdirs.
  **Never build inside the repo or inside `data/atuona/`.**
- Published output: `/home/ubuntu/cto-aipa/data/atuona/films/out/<slug>-<stamp>.mp4`.
  Anything in `out/` is **automatically live**: `GET /films.json` → rendered by
  https://atuona.xyz/aifilmstudio/ ; direct watch/stream URL (HTTP Range/206):
  `https://webhook.aideazz.xyz/cto/films/<file>.mp4`.
- Music library: `/home/ubuntu/cto-aipa/data/atuona/films/music/`.
- Fonts (present on Oracle): `DejaVuSerif.ttf` (poem text), `DejaVuSansMono.ttf` (title cards).

> ⚠️ **`data/atuona/` is NOT durable.** On 01.07.2026 it was wiped during unrelated work —
> all published films and the whole music library vanished from the gallery. **Always keep a
> local (Desktop) copy of every finished film.** Restoring = `scp` the mp4s back into `out/`
> and `touch -d "<original date>" <file>` so the gallery keeps newest-first order.

## 1. Stage the source clips

1. Elena downloads the clips from Telegram into a dated Desktop folder.
2. `scp` them to a **fresh** work dir: `oracle:/home/ubuntu/atuona-<name>/clips/`.
3. Probe every clip: duration, WxH, fps (`ffprobe -show_entries stream=width,height,r_frame_rate`).
   Mixed resolutions/fps are fine — the per-clip normalize step conforms everything to
   **1280×720 / 30fps** (scale to fit + black pad, no crop).

**Errors to avoid:**
- **Filenames starting with `-`** (e.g. `-VSF1F_a.mp4`) are parsed as options by `scp`/`ffprobe`/`ffmpeg`.
  Always use `./*.mp4` or `./-file.mp4`, never bare globs.
- Clips with their own audio track: irrelevant — the pipeline replaces all clip audio with
  silence (VO + music are the only sound). Don't waste time stripping audio first.

## 2. Map each clip to its poem (stanzas must match the visuals)

Telegram download names tell you the render type:
- `atuona-baseN.mp4` = **base renders** (Telegram's default filename). Match them to poems with
  `md5sum` against the persisted shots: `data/atuona/films/shots/<pageId>.mp4`.
- Random names like `yW7lw53H.mp4` = **Director's Cut** renders (Luma S3 basenames). Grep the PM2
  log for the basename and read the surrounding timeline:
  `grep -a -n 'Director.s Cut ready\|persistShot' ~/.pm2/logs/cto-aipa-out-9.log`
  — each `Director's Cut ready: …/<basename>.mp4` line sits right after the `persistShot NNN` /
  "prepared NFT card #NNN" lines of its poem. `atuona-state.json` → `visualizations[]` also maps
  the *latest* DC URL per page (older DC renders only exist in the log).

Record the result as the `POEM_OF` map in the script. **Do not guess** — a stanza over the wrong
poem's visuals is the one mistake a viewer notices instantly.

## 3. Pick the stanzas (English only, verbatim)

- **Rule (Elena, 18.06.2026): on-screen text and voiceover are ENGLISH ONLY.** Poems `#095+` have
  an `English Text` trait in `https://raw.githubusercontent.com/ElenaRevicheva/atuona/main/metadata/<id>.json`.
  (`#007–#046` live in `atuona-complete-with-dates.json`, Russian → translate first.)
- Use `pick_stanzas.py` (in the film work dir on Oracle; gpt-4o-mini via the cto-aipa
  `OPENAI_API_KEY`): for each poem it picks the **N sharpest 2–4-line VERBATIM fragments, in poem
  order**, where **N = how many clips that poem has** in the film.
- Film structure: clip 1 = wordless visual opener (capped at 5.5s); every other clip carries the
  next unused stanza **of its own poem**.

**Errors to avoid:**
- Poems written as single-line paragraphs (e.g. #096, #097) make the LLM return one-line picks.
  Tell it to join 2–4 *consecutive* lines — and review the picks yourself; hand-pick the killer
  line if the model returns filler.
- Don't let the model rewrite lines. Verbatim or nothing.

## 4. Music (Pixabay, free, dark)

- Pick by the **track page's mood tags** (want *Dark / Atmospheric / Cinematic / Suspense /
  Drone*; reject *calm / happy / upbeat / chill*). You cannot audition — tags + title are the truth.
- **Don't reuse tracks** — see the table at the top for what's burned.
- **Pixabay now Cloudflare-blocks plain curl AND simple fetchers** ("Just a moment…" page).
  Working path: **Bright Data Web Unlocker** (token + zone in cto-aipa `.env`):
  ```bash
  curl -X POST https://api.brightdata.com/request \
    -H "Authorization: Bearer $BRIGHTDATA_API_TOKEN" -H "Content-Type: application/json" \
    -d '{"zone":"web_unlocker1","url":"<track page url>","format":"raw"}'
  ```
  then parse the page's JSON-LD (`<script type="application/ld+json">`, `AudioObject`) →
  `contentUrl` = `https://cdn.pixabay.com/download/audio/....mp3`. **The CDN mp3 itself still
  downloads with plain `curl -L -A "Mozilla/5.0"`** — no login needed. Strip the `?filename=` query.
- Track length doesn't need to exceed the film — the mixer loops it (`-stream_loop -1`) —
  but ≥2:30 keeps the loop unnoticeable.
- Land the mp3 in `data/atuona/films/music/` (recreate the dir if it got wiped).

## 5. The settings that make it FLOW (don't regress these)

Each of these was a real iteration; the exact filter strings are in `scripts/atuona-film3.mjs`:

- **Voiceover:** OpenAI TTS `tts-1`, voice **`onyx`**, **`speed: 0.9`**.
  **Call the API with `curl` via `execFile`** — node's native `fetch` **hangs on Oracle**.
- **Voice locked to its clip:** clip duration = `max(natural, 0.7 lead + voDur + 1.9 tail)`;
  VO plays at `clipStart + 0.7`. Never sequence VO independently — it drifts.
- **Extend clips with SLOW-MO (`setpts=factor*PTS`), NEVER freeze-frame** (`tpad` holds an ugly
  stuck frame — e.g. an open mouth).
- **Normalize:** `scale=1280:720:force_original_aspect_ratio=decrease,pad=…` , 30fps, yuv420p,
  libx264 `-preset veryfast -crf 20`, aac 44.1kHz stereo.
- **Poem text runs ACROSS THE WHOLE WIDTH at the bottom** (Elena, 22.09.2026 — a narrow 50-column block in a small
  box read as "placed in the centre"). Join the verse lines, in order, into the fewest screen lines that fit ~92 cols
  (balanced), each centred in a full-width band: `text_align=C:x=0:boxw=1280:boxborderw=22|0|26|0:boxcolor=black@0.42`
  (ffmpeg ≥ 6.1). `spread()` + `node film7.mjs --stanza-preview` (renders every stanza + its pixel width, builds nothing).
  DejaVuSerif 22, fade in 0.7s,
  fade out over the clip's last 1.0s (so stanzas never overlap a dissolve).
  Escape commas inside drawtext expressions (`if(lt(t\,0.7)…)`); use `textfile=` + `expansion=none`.
- **Transitions:** `xfade=transition=fade:duration=1.3` + `acrossfade=d=1.3` (0.8 felt cutty).
  Offset formula: track running `merged` duration — `offset_k = merged − 1.3`,
  then `merged += dur_k − 1.3`. The xfade concat is a full re-encode; give it a long timeout.
- **Title cards** mirror the atuona.xyz site header: MONO font, UPPERCASE, per-letter tracking.
  Intro = film title (size 40, 4.4s) + subtitle `DD.MM.YYYY · ATUONA.XYZ GALLERY · FRAGMENTS #…` — **Fragments, never "Moments"** (Elena, 22.09.2026)
  over a **darkened cover image** (`eq=brightness=-0.36:saturation=0.8`);
  outro = `A T U O N A` (size 56, 4.2s) + `atuona.xyz // Paradise.js · by Kira Velerevich`.
- **⚠️ INTRO CARD MUST NOT FADE IN FROM BLACK** (Elena, 02.07.2026): the gallery's `<video>`
  poster is **frame 0** — a fade-in makes the player look black/broken before play.
  `makeCard(..., noFadeIn=true)` for the intro only; keep the fade-out. Verify after rendering:
  `ffmpeg -i film.mp4 -frames:v 1 poster.jpg` → must show the title card.
- **Cover image:** a provided still (or a frame extracted from the first clip at `-ss 0.6–0.8`).
  If Elena says "use the image in the folder" and there's no image there, **check OneDrive sync /
  Desktop root for a photo saved minutes before the clips** — don't silently fall back to black.
- **Mix:** music `volume=0.30` + soft `afade` in 2s / out 3s, **sidechain-ducked**
  (`sidechaincompress=threshold=0.02:ratio=10:attack=5:release=300`) under the voice bus
  (`volume=1.9`, `asplit` for sidechain + mix), then **`loudnorm I=-16:TP=-1.5:LRA=11`**,
  aac 192k, `-t <bodyLen>` so the looped music is trimmed exactly.

## 5b. Stills → video shots (film #7, 21.09.2026)

When the folder holds images as well as clips, the images go in as **moving shots**, not a slideshow.
`scripts/atuona-still-motion.py` (runs in a venv in the film work dir: `numpy opencv-python-headless onnxruntime`,
model `onnx-community/depth-anything-v2-small` `onnx/model.onnx`, 99 MB):

1. `depth <model> work/depth stills/*.jpg` — monocular depth per still (~3 s each on Oracle's CPU; nothing leaves
   the server, no per-image fee). Review a colorized sheet before rendering: bright = near.
2. Each shot is a JSON spec: `look` (framing path), `zoom`, `truck` (px of parallax at the nearest depth),
   `focal` (depth that stays put — the subject), `dolly` (extra magnification of near pixels), `rot`, `crop`
   (frames out baked text / letterbox), `fx` list: `shimmer` + `caustics` + `bubbles` (water), `dust` (light-gated,
   only visible in light shafts), `drips`, `flow` (smoke drift, masked), `flicker` (lamp / screen / fluorescent,
   masked), plus moving film grain on everything.
3. Vertical 9:16 stills are **not** cropped to 16:9 — they become gallery walls (4 × 300×533, 2 or 3 × 405×720),
   each panel moving on its own, panels fading in one by one.
4. `film7.mjs --probe` renders first/middle/last frames of every still shot for review in one minute; the full
   render is `node film7.mjs` (writes `work/final.mp4`), publishing is a separate `node film7.mjs --publish`.

**Settings that held up:** truck 15–26 px and dolly 0.04–0.11 on full-frame stills (checked at full res on the
hardest depth edge — a hand reaching through a net — no tearing), 6–7 px on wall panels. Depth is **dilated then
blurred** before reprojection so the subject's silhouette carries its own edge and the background stretches instead
of the subject tearing. Grain 0.014 (0.028 made a 6.5 s test 39 Mbps). Slow-mo above ×1.3 uses
`minterpolate=mi_mode=mci` (real in-between frames, ~3–4 fps on Oracle) instead of duplicated frames.

**Errors to avoid:**
- The bot's videos are generated from a separate **"video-safe keyframe"**, not from the Telegram stills — so a
  still is new material, never a duplicate of a clip. Do not try to match-cut a still to "its" clip's first frame.
- AI image-to-video (Luma/Kling/Seedance) is the wrong tool for "make the stills move": it re-draws the picture,
  costs per clip, and refuses the nude stills (that is why the bot makes the video-safe keyframe at all).
- `ssh host 'nohup cmd &'` keeps ssh attached unless stdin is detached — use `nohup cmd </dev/null >log 2>&1 &`.
- Oracle is shared with live bots: `renice -n 10` the render processes.
- The Bright Data **MCP** token 401'd on 21.09; the Web Unlocker call with `BRIGHTDATA_API_TOKEN` from the cto-aipa
  `.env` (below) still worked — Pixabay search pages are server-rendered HTML (title, artist, duration), and the
  mood/genre chips are on each track page (`class="tag--…"`), JSON-LD has the CDN `contentUrl`.
- Baked-in text in stills (`Underground Poem 015` caption, a magazine corner mark, letterbox bars): frame it out with
  `crop`; inpaint only a genuine typo (`UNDERGGROUND`).

## 5c. New generations, video only (film #8, 22.09.2026)

When the brief is "absolutely new videos, no stills in the cut": the stills still exist, but only as **start frames and
character references** — inputs to image-to-video, never shots. Work dir `/home/ubuntu/atuona-<name>/`, same as ever.

1. **Draw the poems, don't choose them** — `random.Random(<date seed>)` over `content/poems.json` (atuona repo), whose
   `venue` field is the chapter: **ATUONA** #047–#099 (English, self-published) and **LITPROM** #001–#046 (Russian,
   Redkollegiya). "From both chapters" = sample each. Exclude the previous film's poems. Record the seed.
2. **Stanzas are hers.** The plan builder refuses to write the plan unless every ATUONA stanza is a substring of the poem's
   `verse` (whitespace-normalised). LITPROM is Russian-only → a line-for-line translation of her exact lines, profanity kept,
   printed next to the Russian in the film record so she can correct it.
3. **Characters first.** One Flux 2 Max portrait per recurring character (`img/kira_ref.jpg`…), then every keyframe is
   Flux 2 Max with that portrait in `input_images` — the same face survives 17 shots. Keyframes 16:9, 2 MP,
   `safety_tolerance` 5. Look + negative prompt live once in the plan and are appended to every prompt.
4. **`atuona-film8-gen.mjs` is the only way money leaves.** It prices every job from the vendor's per-second price BEFORE
   sending it, refuses anything that would pass `BUDGET_USD`, appends every job to `ledger.jsonl` (refusals unbilled), and
   downloads the output at once (Replicate delivery URLs expire). `node gen.mjs image <id>` · `video <shot> [engine]` ·
   `ledger`. It retries Replicate's throttle (below $5 of credit: 6 creates/min, burst 1).
5. **Bake-off before you spend.** Render ONE shot for 5 s on every candidate engine (~$4.50), send her a labelled grid
   video, let her pick. Film #8: Wan 2.7 for emotional close shots, Grok Imagine 1.5 for wide ones (§ record for results).
6. **Fit the shot to the voice, not the voice to the shot.** Render the voice first, then set each shot's duration to
   `LEAD + voice + TAIL` (≤15 s on Wan/Grok) so nothing needs slow-motion; `trim` in the plan drops an off-plan tail.
7. **Voice:** `gpt-4o-mini-tts` with acting direction (`instructions`), not `tts-1`: **cedar** for Ule/narrator (low, dry,
   restrained menace), **marin** for Kira (husky, exhausted, defiant, "never sweet"). `atuona-film8-vo.py`.
8. **Review every clip before compiling** — a sheet of frames at 30/70 % per clip. Engines drift: Grok's s07 panned off the
   objects onto a stranger at 8.5 s; Wan turned Kira's scar into a fresh red wound on close-ups (her call).
   **No stock props (Elena, 22.09.2026):** "no generic glasses with alcohol, generic cell phones and watches — it is
   underground luxury full of sex and poems". A nightstand of glass + phone + watch is a product shot; s05 and s07 were
   re-shot as people in the story (her in the silk, him leaving). An object earns a frame only if the poem names it AND it
   sits on a body or inside the scene's desire.
9. **Compile:** `node film8.mjs` (film7's settings: 1.3 s dissolves, stanzas full-width at the bottom, ducked music,
   loudnorm + limiter, title card on frame 0) → verify → her yes → `node film8.mjs --publish` →
   `python scripts/atuona-add-film-to-site.py` for the atuona.xyz static lists.

10. **Plan knobs in `film8.mjs`:** `slow` (1.2 = 20 % slower; AI video breathes far too fast — interpolated above 1.12×),
   `ss`/`trim` (use part of a clip), `clip` (reuse an earlier render as an extra shot, e.g. `s13b`), `vo: []` (no voice, no stanza),
   `glitch_before` (a still flashed ~1.2 s as an arthouse glitch with near-hard cuts either side — `makeGlitch()`).

**Engines as measured on one shot (s06, 22.09.2026)** — Wan 2.7 `$0.10/s` boldest · Grok Imagine 1.5 `$0.08/s` realistic,
cheapest (**send the image inline as a data URI** — it rejects URLs without a file extension: "Invalid image format") ·
HappyHorse `$0.14/s` · Veo 3.1 Fast · Kling 3.0 Omni `$0.168/s` most faithful, least motion · **Seedance 2.5 refused it**.

**The line.** Adult here means implied: wet silk, bare backs and shoulders, bodies in water, light on skin, raw faces.
**A provider refusal is final for that prompt** — re-phrase into that register; never re-route to a more permissive model
or strip the reference to push it through (tried once for a nude keyframe from a reference photo: the permission gate
blocked it as weakening a safety control, and the route was removed from the tool). Flux 2 refuses nudity whenever a
photo of a person is the INPUT.

### 5d. The engine list as it stands 22.09.2026 (what you can click tonight)

Everything below is wired into the bot, **named-only** — you pick it, it never gets picked for you, and if it misses the
old chain still catches the shot.

**Video — `/visualize <engine> <page>` (14):** `luma` · `omni` · `runway` · `veo` · `kling` · `seedance` · `wan` · `grok` ·
`sora` · `pixverse` · `happyhorse` · `hailuo` · **`venice`** · **`venice18`** (+ `deepseek` as a director that writes the
motion line and hands off).

**Stills — `/imagine <engine> <page>` (15):** `flux` · `luma` · `omni` · `runway` · `seedream` · `gpt` · `grok` · `nanopro` ·
`imagen4` · `ideogram` · `qwen` · `wan` · `hunyuan` · **`venice`** · **`venice18`**.

**Venice is the newcomer and it does not behave like the others.** Its own API, its own prepaid balance
(`/venicekey` to paste a key), and for video it is a **queue**: quote → queue → poll → it hands back the **mp4 bytes**,
not a link. Measured on the first real render, 22.09.2026: **$0.52 → 119 s → 5.20 MB, h264 1280x720, 5.04 s, with a
native AAC track**; the balance moved by exactly the quote. That is **~$0.104/s — about 7x Grok**, so treat it as a
chosen instrument for the shots that need it, not a default; a 3-minute film of it is roughly $19.
**Length: 10 s per render since 23.09.2026** — $1.04 (720p) / $2.37 (Pro); up to 30 s exists, but 15 s+ Pro trips the
$3 cap and long single takes drift. 10–15 s is the film sweet spot (film #8 shots were all ≤15 s, cut to the voice).

⚠️ **`venice18` means two different things on the two commands, and only one of them is a filter.**

| | `/imagine venice18` | `/visualize venice18` |
|---|---|---|
| what changes | the vendor's own documented `safe_mode` switch, **off** | the **model tier**: Wan 3.0 Pro, 1080p instead of 720p — and the **start frame** (below) |
| is it an adult switch? | yes — that is exactly what the flag does | not by itself: the video API has no `safe_mode`. What it animates is decided by the frame it is handed |
| what still applies | Venice's content policy (HTTP 422 on a refused prompt) | the same policy, unchanged |

Venice marks 44 of its 138 video models `uncensored: true` (the whole Wan 3.0 family), which is why the video lane is
less restricted than Replicate's — but "less restricted" is not "no rules", and **nothing on the adult side has been
tested with an actual explicit prompt yet.** Do not write a claim into this guide that a render has not proven.

**The Venice lane draws its own start frame (fixed 22.09.2026 late, `217be55`).** The first `/visualize venice18 048`
cost $1.18 and animated a chiaroscuro **Flux** frame — Venice was never actually asked for anything. Three steps upstream
of it were all written for the *strictest* video engines: the Flux gallery still, a second deliberately softened
"video-safe keyframe" pass, and a motion scrubber that swaps words like *nipple* for *shadow*. Swapping the video engine
changed nothing because the constraint was never at the video step — **premature sanitisation**: the input degraded for
the most restrictive consumer before anyone knew which consumer it was for. Now, in the Venice lane only:

- the start frame is drawn by **Venice's own image engine** from the same gallery prompt
  (`/visualize venice` → `safe_mode` on, `/visualize venice18` → off), and the bot says so in a line of its own:
  *"Start frame drawn by Venice SD3.5 — ADULT (safe mode off) — not Flux"*. **No such line = the frame came from elsewhere.**
- the softened keyframe pass is skipped, and the motion line goes unscrubbed (≤1400 chars)
- every other engine behaves exactly as before

**The boundary this does not cross:** Flux is never asked in the Venice lane. "Flux refused, so hand it to Venice" would be
re-routing a refusal and stays off-limits whatever the code looks like. Venice's own 422 is final for that prompt.

## 5e. Commercial promo films — the AI Growth Operator promo (30.09.2026)

A client-facing ad, not a poem film: *She Asked ChatGPT Before She Messaged Your Yacht* (AIdeazz AI Lab). Plan, prompts,
gates and spend: `docs/selling/video/2026-09-30_AI_GROWTH_OPERATOR_SHOTLIST.md` + `aigo-promo-plan.json`. Tools:
`scripts/aigo-promo-gen.mjs` (a **copy** of `atuona-film8-gen.mjs` — same `BUDGET_USD` guard + `ledger.jsonl`, own folder
`~/aigo-promo`), `scripts/aigo-promo-roughcut.py` (picture laid to the narration), `scripts/aigo-promo-vo-*.py` (voices).

**Character continuity is a chain, never a hope.** Two people recur (a New York woman, a Panamanian owner-captain):
1. **Lock the faces first** — candidate portraits on 3 still models, the client picks one per person (`R1.jpg`, `R2.jpg`).
2. **Every keyframe is built WITH the locked face passed in** (`input_images` / `image_input`) + outfit views.
3. **Every video STARTS from its approved keyframe** (`start_image` / `image` / `first_frame_image`); Kling also takes
   `reference_images` during motion.
4. **Contact sheet vs the locked faces before any motion is bought.** Stills cost cents; motion costs dollars.

**Engines, measured on the same payoff frame (5 s, 1080p, no audio):**

| Engine | Where | $ / 5 s | Verdict for realistic people |
|---|---|---|---|
| **Venice Wan 3.0 Pro** | Venice API (quote→queue→retrieve) | $1.18 | **held her identity best** — chosen for the face shots |
| **Hailuo 2.3** | Replicate `minimax/hailuo-2.3` (6 s) | $0.56 | natural, face holds — best value |
| **Kling 3.0 Omni** | Replicate, pro 1080p | $1.12 | most cinematic; face drifted mid-shot (3 refs incl. HIS face — likely the cause) |
| **Luma ray-3.2** | Replicate | ≈$1.20 | she turned away, face changed — weakest |
| **Runway Gen-4.5** | Replicate `runwayml/gen-4.5` ($0.12/s) | $0.60 | beautiful wides; **invents a different person after ~3.5 s** — use only the first 3 s |
| Veo 3.1 / Seedance 2.5 | Replicate | — | **refused** an innocent realistic frame ("flagged as sensitive", E005) — not billed |
| Sora 2 Pro | Replicate w/ OpenAI key | — | **HTTP 404 on `/v1/videos`** — our OpenAI org has no Sora video access |

**Stills:** GPT Image 2 (high, $0.128) made the chosen faces and every keyframe; Nano Banana Pro ($0.15) the most natural
skin; Flux 2 Max aged a "40-year-old" to ~60. **Voice:** OpenAI `gpt-4o-mini-tts` read as robotic to the client →
ElevenLabs v3 and MiniMax Speech 2.8 HD on Replicate ($0.10 / 1k chars). Every take is transcribed back before anyone hears it.

**Real vs generated — the rule that keeps an ad honest.** "The people in this film are AI. The product screens are
real." → generate only people and places; every product/app screen is a **real capture** (phone recordings, screenshots),
cropped or blurred for names, numbers and private chats. Landscapes may be real stock **only if the clip is really that
place** (see recap 36). The whole first pass (faces → keyframes → 7-engine test → 8 shots → 5 fixes) cost **$19.90**.

## 5f. The AI Growth Operator promo series — the finished machinery (01–02.10.2026)

§5e grown into a series: four client ads, one brand system, one cut engine, a new story per ICP lane — three share one voice
(MiniMax `English_magnetic_voiced_man`); the /api film keeps the old films' OpenAI onyx. The yacht, villa and relocation films each
have their own Oracle folder with their own `gen.mjs` copy and `ledger.jsonl`; the /api film is a re-edit in `~/aigo-promo/apim`
(no new generations, no ledger of its own). **The `reloc-*` scripts are the newest and most
complete — a new film starts as a copy of them.** Titles, descriptions, chapters, flags and links:
`docs/selling/video/2026-10-01_AIGO_YOUTUBE_UPLOAD_SHEET.md`.

| Film | Scripts (`scripts/`) | Oracle | Music (Pixabay, not Content ID) | Final |
|---|---|---|---|---|
| *She Asked ChatGPT Before She Messaged Your Yacht* (cut v7, 90.2 s) | `aigo-promo-cut5.py` · `aigo-promo-v4-assets.py` · `aigo-promo-music-mix.py` · `aigo-promo-thumbnail.py` | `~/aigo-promo` | "Deep House Track" — cornist | md5 `89e91e420be7f7b767010f048f478f37` |
| *Can AI Find and Cite Your Business?* (/api, v13 + v19 merged, 90.6 s) | `apim-vo.py` · `apim-rec-groups.mjs` · `apim-assets.py` · `apim-cut.py` · `apim-srt.py` | `~/aigo-promo/apim` | "Modern Deep House" — ArtIssizm | md5 `28d5b97174db9989e935f9ece89a8a31` |
| *She Asked ChatGPT Before She Booked Your Island* (villa + charter, 94.4 s) | `villa-vo.py` · `villa-assets.py` · `villa-cut.py` · `villa-srt.py` | `~/aigo-villa` | "Afro Beat Vibes" — -WATERMEL0N- | md5 `7253d8df068f8d243cb6ecc3ca0799a5` · ledger $13.69 of $14 |
| *They Asked ChatGPT Before They Messaged You* (relocation: real estate agencies + immigration lawyers, Panama; 97.75 s, −15.7 LUFS) | `reloc-vo.py` · `reloc-rec-audit.mjs` · `reloc-safe-screens.py` · `reloc-assets.py` · `reloc-cut.py` · `reloc-srt.py` · `reloc-thumbnail.py` | `~/aigo-reloc` | "Deep House" — alexrockbeat | v1 https://youtu.be/f4NHCuLDHa4 (md5 `20c7f5fcdc251295adeedef6e99b8eda`) · v2 https://youtu.be/y1ZhWyqJW0w (md5 `5ab513a8aa24a09bf387deb10fe226b9`) — **both stay live** (Elena) · ledger $12.59 of $13.50 |

Masters, EN + ES SRT, EN + ES thumbnails and the upload sheet live in Elena's Desktop folder `API promo campaign/11.09.2026
API video for YouTube campaign`. The relocation file there is **v2 under the original name**; v1 sits beside it as `… (v1 - first YouTube upload).mp4`
(also on Oracle `~/aigo-reloc/cut1/RELOC_FINAL_2026-10-02_1080p.mp4`) — §0: every finished film keeps a local copy.

**The pipeline, in order** (the relocation film is the reference run):

1. **Plan by workflow, never by one draft.** 8 agents: 3 concepts → 3 judges (the two buyers · legal/compliance ·
   production realism + cost) → synthesis → critic. Every critic issue is checked against the code and the prospect file
   before it is applied (`docs/selling/video/2026-10-02_RELOCATION_FILM_PLAN.md`). The plan carries the budget by gate and
   the drop order; a mid-production request is paid from the drop list, never from the reserve.
2. **Spend is asked per gate, before it runs** (1 faces · 1b relative + wardrobe · 2 keyframes · 3 motion · voice). The
   film's own `gen.mjs` copy runs with **`BUDGET_USD=13.5` on every call** — the file's default is 30, so a call without it can
   spend to $30 against the ledger. Deploying a new film folder = `scp scripts/aigo-promo-gen.mjs` and change only line 19 (`BASE`);
   `scripts/aigo-promo-gen.mjs` stays the one canonical copy.
   Replicate is prepaid and we cannot see the balance without her sign-in: **Elena reads replicate.com/account/billing
   before a gate** (below $5 it throttles — 429s on 1 Oct).
3. **Faces (gate 1).** GPT Image 2 high, $0.128, **3:4 only** (4:5 is rejected). A candidate keeps its candidate name and
   is `cp`'d to `img/R1.jpg`, `R2.jpg`… only after her pick. Pick sheets: `scripts/aigo-gate-sheet.py` (3:4 tiles, labelled). A relative is generated FROM the picked face, then checked
   cold ("do they read as mother and son?").
4. **Wardrobe (gate 1b).** No colour an earlier film wore (the plan lists the yacht and villa palettes); one anchor colour
   per person, held in every shot.
5. **Keyframes (gate 2).** The gate-1 prompts and the gate-2 keyframe prompts are each made by a workflow: draft →
   realism/AI-tells critic + continuity/compliance critic → revise. GPT Image 2 with the locked face passed in; **Nano
   Banana Pro** ($0.15 + $0.035 per reference) for highland and real-world frames. Posture words: recap 35.
6. **Motion (gate 3).** Kling 3.0 omni pro, 5 s, the locked face in `reference_images` ($1.12) for face shots; Hailuo
   2.3, 6 s ($0.56) for the rest. Every clip starts from its approved keyframe and **plays at normal speed** — a held
   face shot needs a take that long; slow-mo plus a freeze still reads static (recap 57).
7. **Voice** — `reloc-vo.py`. MiniMax speech-2.8-hd, `English_magnetic_voiced_man`, `emotion: calm` (yacht, villa,
   relocation; the /api film keeps the old films' `tts-1` / `onyx` / 0.9 — `apim-vo.py`). Record only new lines; a line
   word-for-word from an earlier film is that film's take, copied ($0). Every take is transcribed by **two** Gemini models
   (`gemini-2.5-flash` + `gemini-3.5-flash`); a key phrase missing in either = retake. `KEEP=s01,…` re-checks takes on
   disk without re-billing. Caption chunks are timed by `silencedetect` (−38 dB, d=0.12) on each take.
8. **Real screens, made safe** — `reloc-safe-screens.py`. A real test inquiry goes through the live aideazz.xyz/portfolio
   form in a real browser (invisible reCAPTCHA); Elena's phone captures what really happened (ChatGPT recording, WhatsApp
   bubble, Zoho inquiry copy, Telegram card / draft / SENT, Gmail reply, HubSpot deal). `reloc-safe-screens.py` Gaussian-blurs,
   then crops, the five stills (Zoho, Telegram card + draft, Telegram SENT, Gmail, HubSpot): emails, her name, lead ids,
   timestamps, the deal prefix, the bot header, other leads; the WhatsApp bubble is cropped to the bubble with its time blurred.
   The ChatGPT recording plays to **"Searching 11 websites"** — the first answer paragraph names no firm; names come later.
9. **A fresh real audit per film** — `reloc-rec-audit.mjs` (Playwright; `playwright-core` from
   `~/aigo-promo/rec/node_modules`) films the live aideazz.xyz/api auditing an AIdeazz-owned page that really scores 57/C.
   The audited domain is blurred box by box per segment (`boxblur` in `split_audit`, `reloc-cut.py`).
10. **Stock with location proof.** Pexels pages 403 to curl from Oracle — read them in the built-in browser. The place is
    proven by visible landmarks on a frame sheet (`scripts/aigo-frame-sheet12.sh`), not by the page (recap 48): R0 Chicago
    36244311 · R1/R1b Punta Pacifica 33811915 · Casco Viejo 35257068 (B2) + 29754758 (R2, ICP card) · R3 Chiriquí 38893319 · valley 36770925. Bright aerials are darkened
    (`eq=brightness=-0.10`, mist `-0.15`) and the caption scrim raised (alpha 150 → 205) so the serif reads.
11. **Brand system** — `reloc-assets.py` (local Pillow; lineage `aigo-promo-v4-assets.py` → `villa-assets.py`). Spanish
    captions in Instrument Serif with the key phrase in gold italic, no box · glass title cards · mono chips (scene, day) ·
    split frames: real screen left, big QR right · ICP card with this film's lanes first, in gold · end card · an opening
    title that shrinks until it fits (≤ 1100 px). Panama wording: **"abogados de inmigración", never "bufete"**.
12. **Cut** — `reloc-cut.py`. **One frame clock:** decoded voice length + pauses, `INTRO` 1.5 s (/api 1.2); each shot is a
    segment of exactly its frame count → concat → **one overlay pass** (captions, titles, chips, cards); the clock is
    written to `clock.json`. `OVERLAY_ONLY=1` re-runs only the overlay pass; `REBUILD=1,4,…` re-renders only those
    segments and re-concats (a card baked into a segment is not an overlay — recap 51). Long runs:
    `setsid nohup … </dev/null >log 2>&1 &`, then wait on a log line (recaps 52–53).
13. **Music hunt (workflow).** A finder in the browser reads each Pixabay page's JSON-LD and rejects "Content ID
    Registered" / `hasYoutubeContentId`; one verifier per track: Gemini listens to the whole track + demucs `htdemucs`
    two-stem vocal ratio. Never a track or artist already used (the plan lists them). **demucs one at a time** (recap 54).
14. **Mix** — `aigo-promo-music-mix.py <music> [start] [out] [picture] [voice]`. The bed is **measured** to −25.7 LUFS
    (Pixabay masters differ by 8 dB), sidechain-ducked under the voice, 1 s in / 5 s out, limiter. Finals −15.6 to
    −16.9 LUFS.
15. **QA before she sees it.** A frame sheet, one frame per shot · the QR decoded with OpenCV from exported frames — crop,
    scale 0.25–0.5, threshold sweep · `ebur128` · grep captions, cards and SRT for banned words.
16. **Deliverables.** `reloc-srt.py` writes EN + ES SRT from the same `clock.json`; `reloc-thumbnail.py` EN + ES (the yacht
    thumbnail system, on the film's last smile). Master + SRT + thumbnails → the Desktop folder; titles, descriptions,
    chapters (each ≥ 10 s, first at 0:00) → the upload sheet.
17. **YouTube upload through her Chrome** (Claude in Chrome, at her request). `file_upload` takes ≤ 10 MB per call → split
    the master into 9.5 MB parts, load them into hidden inputs, rebuild one `File` from the Blobs in-page, assign it to the
    `Filedata` input + fire `change`; check the size is byte-exact. Title and description: set the contenteditable's
    `textContent` + an `InputEvent`, then read the counters (98/100, 1879/5000). Tags: chip input value + Enter. Made for
    kids NO · altered content YES (radio click) · no CC track (Elena: the ES captions are burned in; YouTube auto-shows CC
    in muted autoplay). A published video's file cannot be replaced — a fix is a new upload (recap 61).

## 6. Run, verify, publish

```bash
cd /home/ubuntu/atuona-<name> && node film3.mjs
```

Verification checklist (all against the file in `out/`):
1. `ffprobe`: h264 1280×720 30fps + aac 44100 stereo; duration sane
   (≈ Σ clipDurs + 8.6s cards − 1.3s × (numSegments−1) overlaps).
2. Loudness: `ffmpeg -i film.mp4 -af ebur128 -f null -` → Integrated ≈ **−16…−17 LUFS**, LRA ≈ 7.
3. Frame 0 = title card (see poster rule above).
4. `curl -s 127.0.0.1:3000/films.json` lists it; Range check:
   `curl -o /dev/null -w "%{http_code}" -H "Range: bytes=0-1023" 127.0.0.1:3000/films/<file>.mp4` → **206**.
5. `rm` any older render of the same film so only the final stays in `out/`.
6. `scp` the final mp4 to Elena's Desktop (local durable copy — see the wipe warning in §0).

## 7. Recap — the errors, in one list

1. Compiling anywhere but Oracle (no ffmpeg locally; WSL not installed).
2. Bare globs / unprefixed `-` filenames eaten as CLI options.
3. Guessing clip→poem mapping instead of reading PM2 logs + md5 vs `shots/`.
4. Russian on screen or in VO — English only, verbatim fragments.
5. node `fetch` for TTS — hangs; use curl.
6. Freeze-frame instead of slow-mo to extend a clip.
7. 0.8s crossfades (cutty) — use 1.3s; wrong xfade offset formula (use the running-merged one).
8. Unescaped commas in drawtext expressions.
9. Serif/lowercase title cards — cards are mono/tracked/caps like the site.
10. Intro card fading in from black → black gallery poster.
11. Cheerful music picked blind — judge by mood tags; never reuse a previous film's track.
12. Fetching Pixabay pages without Bright Data (Cloudflare) — but the CDN mp3 is still open.
13. Trusting `data/atuona/` to persist — keep Desktop copies of every film.
14. Forgetting `touch -d` when restoring old films (breaks gallery ordering).
15. `git add -A` in this repo — commit only the files you touched.
16. Dropping the stills, or cropping 9:16 stills into 16:9 — animate them (§5b) and give verticals a wall.
17. Writing the render straight into `out/` — it is live the moment it lands; render to `work/`, verify, then publish.
18. After publishing, the static film list on atuona.xyz (`public/llms.txt`, the `ItemList` JSON-LD and the
    `<noscript>` list in `public/aifilmstudio/index.html`) still names the old count — add the new film there too:
    `python scripts/atuona-add-film-to-site.py D:/aideazz/atuona <published file> <YYYY-MM-DD> "<Title>"` (asserts every match).
19. Spending on paid renders without a price check and a cap — use `atuona-film8-gen.mjs` (`BUDGET_USD`, `ledger.jsonl`).
20. Assuming Replicate bills the card — it is **prepaid credit**; below $5 it throttles to 6 jobs/min. Check before a batch.
21. Parallel jobs writing one cache file — 6 keyframes crashed on a half-written `uploads.json`; write atomically.
22. Re-routing a refused shot to a more permissive engine — re-phrase it instead (§5c, the line).
23. `ffmpeg` inside a `while read` loop eats the loop's stdin (it ate one character per title) — always `-nostdin`.
24. Compiling without looking — sample every clip; engines drift off the plan mid-shot.
25. Assuming every engine answers with a hosted URL — **Venice answers with the mp4 bytes**, and returns them from a
    *queue*, not the call you made (`/video/quote` → `/video/queue` → poll `/video/retrieve`). Write the bytes under a
    **prefixed** stem (`venice-<page>-<ts>`), never `{pageId}.mp4`, or the render overwrites the base cut this guide's
    `/film build` step reads. Wired as `/visualize venice` (720p) and `/visualize venice18` (1080p Pro).
26. Writing a price cap against field names from the docs and never printing the raw body — Venice replies
    `{"quote":0.52}`, so a cap reading `price_usd`/`cost_usd`/`usd`/`price` got `NaN` and let **every** price through
    silently. Print the vendor's actual response once before trusting any guard built on its shape.
27. Sending a shots URL to a third-party API as the start frame — `/films/shots/…` carries `ATUONA_FILMS_KEY` in the
    query string. Send the image **inline as a data URI** so the key never reaches the vendor's logs.
28. Reading `uncensored` as "no filter" — Venice flags 44 of 138 video models `model_spec.uncensored: true`, but its own
    content policy still returns **422** on a refused prompt, and the video API has **no `safe_mode` switch** (only the
    image API does). `venice18` on `/visualize` is a *tier*, not a second filter setting. See
    `docs/atuona/2026-09-22_MODEL_AUDIT_AND_TOPUPS.md` §7.
29. Wiring a permissive engine at the END of a chain built for the strictest one — it can only animate what it is handed.
    `/visualize venice18` first ran on a softened Flux frame and a word-scrubbed motion line ($1.18, nothing new). Sanitise at
    the boundary it is for, not at the source (§5d).
30. Generating each scene from text and hoping the faces match — lock reference faces first, pass them into every keyframe,
    start every video from its keyframe (§5e).
31. Trusting a clip past its first seconds — Runway Gen-4.5 invented a different woman after ~3.5 s; engines also flip
    a skipper to face the stern. Sample every clip (start / middle / end) before it goes in the cut.
32. `gemini-3.8-flash-tts` **speaks acting notes aloud** ("Say warmly…") and rejects `systemInstruction`; put direction in
    OpenAI TTS's separate `instructions` field, or use a model that listens to it. Transcribe every take.
33. Luma (and Grok) reject Replicate file URLs (`video.start_frame: Unsupported content type`) — send the start frame inline.
34. Sora 2 via Replicate fails with an **empty** error when the OpenAI org has no video access — the direct API says 404.
35. Words like "curled on a sofa, legs tucked under her" + silk trip GPT Image 2's filter on an innocent portrait — neutral
    posture words pass. Re-phrase; never re-route (recap 22).
36. Stock "San Blas" footage that was filmed elsewhere: Pexels location metadata said Atlanta / Indonesia / Philippines /
    Paris, "Panama" was only an SEO tag; Pixabay's "117+ San Blas" was fuzzy matching (San Francisco, San José). A clip
    is that place only if visible landmarks on a frame sheet prove it (the page field is often blank or the uploader's own
    location; recap 48).
37. A styled QR (rounded modules, gradient) may not decode with standard readers — threshold it to black/white to verify
    the URL, and test-decode frames from the exported video at the size it plays.
38. Showing a phone screen recording raw — cut the home screen and any chat list / drawer with private titles before use.
39. Planning a client film from one draft — the relocation plan came from 8 agents (3 concepts → 3 judges → synthesis →
    critic); the critic raised 20 issues; each was checked against the code and the prospect file, and only the confirmed ones
    were applied (§5f.1).
40. Asking GPT Image 2 for a 4:5 face — it is rejected. Faces are 3:4.
41. `gemini-2.5-pro` now answers 404 — the take check runs on `gemini-2.5-flash` + `gemini-3.5-flash`.
42. One of the two transcribers heard "can" for "can't" in line 2 — a take that can be heard as the opposite claim is a
    retake (line 2 was re-recorded). One model is not a check: a key phrase missing in either model = retake.
43. Assuming the Replicate credit is there — we cannot see the balance without her sign-in. Elena checks
    replicate.com/account/billing before each gate.
44. Scripting the test inquiry — the aideazz.xyz/portfolio form sits behind an invisible reCAPTCHA; only a real browser
    gets through.
45. The test inquiry's reply was drafted by the Lead Concierge's OpenAI fallback because the Anthropic credit was empty — a
    film test is a live system test: note which model drafted, and report an empty credit as a finding.
46. v1 cut the ChatGPT recording at "Searching the web" — Elena: it looked empty, just her request. Play it to "Searching
    11 websites": the first answer paragraph names no firm; names appear later.
47. Pexels pages 403 to curl from Oracle — read them in the built-in browser.
48. Pexels' `location` field was blank or the uploader's own location for all 6 picks — the place is proven by visible
    landmarks on a frame sheet (replaces the page test in recap 36).
49. Serif captions washed out over bright real aerials — darken the clip (`eq=brightness=-0.10` / `-0.15`) and raise the
    caption scrim (alpha 150 → 205).
50. "bufete" went into the title, chips, captions, ChatGPT bubble and end card — in Panama the word is "abogados de
    inmigración". Grep every caption, card and SRT for it.
51. The "bufete" end card was baked into a segment, so the overlay-only re-run left it in the film — `REBUILD=<n>`
    re-renders just those segments.
52. A render tied to the ssh session died at 39 s when the connection dropped — launch long runs with
    `setsid nohup … </dev/null >log 2>&1 &`.
53. Waiting with `pgrep -f <name>` — it matched its own bash command line and never ended. Wait on the script's final
    log line.
54. Four demucs runs in parallel OOM-killed `openclaw-gateway` (systemd restarted it) — Oracle carries live bots; demucs
    one at a time.
55. Tracks were rejected for a spoken producer tag and for sounding "generic" — tags and titles reveal neither. Gemini
    listens to the whole track and demucs measures the vocal ratio before she hears a candidate.
56. The v19 /api promo's track was Content ID registered, so the merged film could not keep it — read the Pixabay
    JSON-LD (`Content ID Registered`, `hasYoutubeContentId`) before a track becomes a candidate.
57. The mother looked static in v1: the rewind was a zoompan over a still, and the terrace shot was slowed, then frozen —
    v2 bought new Kling takes (A2b, P2b) played at normal speed. A held face shot needs a take that long; slow-mo plus a
    freeze still reads static (refines recap 6).
58. A styled QR does not decode from a raw frame — crop + scale 0.25–0.5 + threshold sweep in OpenCV (extends recap 37).
59. Claude in Chrome's `file_upload` takes ≤ 10 MB per call; the masters are 36–59 MB — split into 9.5 MB parts, rebuild
    one `File` from the Blobs in-page, assign it to `Filedata` + `change`, verify the size byte-exact.
60. With Chrome in the background, CDP typing and `execCommand` did not land in YouTube Studio's fields — set
    `textContent` + dispatch an `InputEvent`, and trust only the on-page counters.
61. A published YouTube video's file cannot be replaced — a fix is a new upload. Both relocation versions stay live
    (Elena: "Do not unlist anything").
62. v2 was saved to the Desktop under v1's file name, so v1 — still live on YouTube — briefly had no local master (copied
    back as `… (v1 - first YouTube upload).mp4`). Version the file name everywhere, as Oracle did (`RELOC_FINAL_v2_…`).
