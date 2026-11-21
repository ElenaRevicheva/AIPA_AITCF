# Film 02 v5 — handoff prompt for a Claude Code session WITH Claude in Chrome (21 Nov 2026)

Paste everything below the line into a new Claude Code session started with Chrome connected.

---

Read `docs/oracle/NOW.md` first (top 3 entries are about this film), then do this task.

**Goal:** EspaLuz promo film 02 v5 (EN, ES, RU, 29 s, vertical 720x1280) = the current v3 film + Latin American
scenes + Latin American music + EspaLuz's voice. Finished files with sound baked in — Elena has no time to add
anything on the platforms.

**Step 0 — prove Chrome works.** Load the `anthropic-skills:chrome-browser` skill, then the `mcp__claude-in-chrome__*`
tools. Open a NEW tab on grok.com/imagine (Elena is signed in). If the tools are missing, stop and tell her in one line.

**Step 1 — new Latin American scenes in Grok Imagine (free, her plan; NOT Replicate, NOT stock sites).**
- Same family as the film: references = frames in
  `D:/aideazz/ascent-saas-builder/creatives/espaluz-demo-20261117/grok/` (S1_1.jpg … S4_3.jpg, Elena approved all 17 Nov).
- Method that made them (memory `feedback_heroes_photorealistic`): Image mode + reference → photorealistic still
  (camera / lens / skin-texture words, "not a cartoon, not a 3D render") → Make Video, 9:16. Maximum realism.
- Shots (2–3): the family arriving on a colourful colonial street in Latin America (opening, replaces/joins S1_1);
  a local market or kiosk for "the little things nobody explains" (scene 3); optional: kids in a Spanish-first school yard.
- Casting rule: a family FROM ABROAD settling in, never locals; show a cue of the move (`feedback_espaluz_promo_casting_newcomers`).
- Save every take to `.../creatives/espaluz-demo-20261117/grok-latam/` + `MANIFEST.md5`. Show Elena the takes
  (Telegram via the CTO_AIPA bot, see below) and let her pick before cutting.

**Step 2 — music: Latin American, never classical.** Elena chooses: (a) our own track via the AIGO generator
`scripts/aigo-promo-gen.mjs music <id>` (ElevenLabs Music on Replicate, force_instrumental, ~$0.40 per 35 s — only
with her explicit OK on the spend), or (b) a Pixabay track she downloads herself into her Downloads folder. Never
scrape Pixabay, never Bright Data Web Unlocker, never a disguised browser past a bot wall (the safety layer refuses;
do not retry). Gates: no vocals, not Content ID registered, not used before.

**Step 3 — cut + sound, on the LAPTOP only (never render on Oracle).**
- Picture: `.../film02/cut.py` + `cut_v2.py` (v3 captions, style A boxes Elena picked). Add the new scenes in the plan;
  keep captions. Reuse AIGO effects where they help (`scripts/aigo-promo-cut5.py`, `aigo-promo-v4-assets.py`):
  slow push-in on stills, phone screen on blurred fill, darkened reveal + vignette under the end card.
- Sound: `.../film02/add_sound.py` (exists, tested): EspaLuz voice = Azure Phoebe via the live generate-voice function
  (hero 'usual', every line must report spokenBy=azure-usual), one short line per scene, music ducked under the voice,
  -14 LUFS. Swap its MUSIC path for the chosen Latin track; mix level the `aigo-promo-music-mix.py` way (measured bed).
- ffmpeg: `C:/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v9.0.2.exe`.

**Step 4 — verify, then deliver.**
- Loudness -14 LUFS ±1 per language; Whisper transcript (Groq key in `D:/aideazz/ai-cofounders/cmo-aipa/.env`) matches
  the spoken lines; in RU write Spanish words in Cyrillic for the voice («ахорита»).
- Send to Elena's Telegram: scp to Oracle `~/_tmp-film02-sound/`, `sendVideo` with the CTO_AIPA bot (token +
  first TELEGRAM_AUTHORIZED_USERS id read by grep from `~/cto-aipa/.env`, never print them), then `rm` the folder.
- Output names: `out/espaluz-film02-<lang>-v5.mp4`. Never overwrite v1–v4.

**Rules:** money only with Elena's OK; never `git add -A`; update NOW.md (push to main) with DONE / NEXT / VERIFIED BY /
RISK; end with the five-part closing message from CLAUDE.md.

**Also open (not this task):** ascent `fa8b3c9` ("Espa" deep violet in the logo) needs Publish in Lovable;
Russian films have no ANDROID footer line (Influencer bot, EN/ES only).
