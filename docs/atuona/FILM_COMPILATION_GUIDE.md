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
