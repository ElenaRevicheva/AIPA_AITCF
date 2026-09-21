# Atuona AI Film Studio — Film Compilation Guide

**How to compile Telegram-downloaded Atuona clips into a published film, step by step, with every error we already paid for.**

Films produced with this pipeline:

| Date | Film | Script | Music (Pixabay) |
|---|---|---|---|
| 17.06.2026 | *Between Compile and Run* | `scripts/atuona-film-final.mjs` | Light In The Void (Dark Cinematic Ambient) |
| 19.06.2026 | *Stanzas* | `scripts/atuona-montage.mjs` | Fatal Error |
| 02.07.2026 | *The Secret Exhibition* | `scripts/atuona-film3.mjs` | Dark Cinematic Drone Deep Bass Ambient |
| 03–04.07.2026 | *Reprint* · *Recovered* | work dirs `atuona-film4/5` on Oracle | Melancholic Ambient (Universfield) · Atmospheric Dark Cinematic |
| 21.09.2026 | *Paradise Is Compiled* — 19 clips **+ 20 stills turned into video shots** | `scripts/atuona-film7.mjs` + `scripts/atuona-still-motion.py` | Red Lips (Sensual Noir Lo-Fi Beat) — WBM Studio |

The canonical, most current reference is **`scripts/atuona-film7.mjs`** (film3's pipeline + stills-as-shots,
gallery walls for vertical stills, motion-interpolated slow-mo, verify-before-publish). For clips-only films
`scripts/atuona-film3.mjs` is still the simplest start: change the constants at the top and run.
Never re-invent the ffmpeg chains: every setting below was a real iteration. Film #7's full record
(file→poem evidence, translations, stanza table): `docs/atuona/FILM7_PARADISE_IS_COMPILED.md`.

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
- **Poem text:** DejaVuSerif 22, `box=1:boxcolor=black@0.5`, bottom band, fade in 0.7s,
  fade out over the clip's last 1.0s (so stanzas never overlap a dissolve).
  Escape commas inside drawtext expressions (`if(lt(t\,0.7)…)`); use `textfile=` + `expansion=none`.
- **Transitions:** `xfade=transition=fade:duration=1.3` + `acrossfade=d=1.3` (0.8 felt cutty).
  Offset formula: track running `merged` duration — `offset_k = merged − 1.3`,
  then `merged += dur_k − 1.3`. The xfade concat is a full re-encode; give it a long timeout.
- **Title cards** mirror the atuona.xyz site header: MONO font, UPPERCASE, per-letter tracking.
  Intro = film title (size 40, 4.4s) + subtitle `DD.MM.YYYY · ATUONA.XYZ GALLERY · MOMENTS #…`
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
    `<noscript>` list in `public/aifilmstudio/index.html`) still names the old count — add the new film there too.
