# Atuona engines — model audit + which accounts need money (22 Sep 2026)

Every row was checked live today: Replicate model API + search (version dates, input schemas, prices from the model
pages), Google `models.list` on our key + ai.google.dev pricing, Runway `/v1/organization`, DeepSeek `/user/balance`,
an OpenAI TTS call, and the bot's own PM2 logs. Nothing below is from memory.

## 1. Are the pinned models the newest? (`src/atuona-video-pins.ts`, `src/atuona-image-pins.ts`)

### `/visualize` (video)

| Engine | Pinned now | Newest available | Verdict |
|---|---|---|---|
| Luma | `ray-3.2` | `ray-3.2` (newest Luma anywhere, Replicate version 2026-06-10) | ✅ current |
| Gemini Omni | `gemini-omni-1.1-flash` | same (only other is the older `gemini-omni-flash-preview`) | ✅ current |
| Runway | `gen4.5` | `gen4.5` (`aleph-2` is a video *editor*, not a generator) | ✅ current |
| Veo | `veo-3.1-generate-preview` | same — `-fast` / `-lite` are cheaper tiers, not newer | ✅ current |
| **Kling** | `kwaivgi/kling-v3-video` | **`kwaivgi/kling-v3-omni-video`** — same 3.0 generation, same date, **adds up to 7 reference images** (same face across shots) + reference video; takes every input the bot sends today | ⬆ **upgrade** |
| Seedance | `bytedance/seedance-2.5` | same (2.0 / fast / mini are older or cheaper) | ✅ current |
| DeepSeek | director only (writes the motion line) | — | n/a |

### `/imagine` (stills)

| Engine | Pinned now | Newest available | Verdict |
|---|---|---|---|
| **Flux** | `black-forest-labs/flux-2-pro` ($0.015/MP) | **`black-forest-labs/flux-2-max`** — "highest fidelity" FLUX.2, same inputs, $0.03/MP | ⬆ **upgrade** |
| Luma | `uni-1-max` | cannot list — Luma's platform docs are behind a login and the API has no models endpoint | ❔ unverified |
| Gemini | `gemini-3.1-flash-image` (Nano Banana 2, $0.067/1K image) | same version; **`gemini-3-pro-image`** (Nano Banana Pro, $0.134) is a higher-quality tier, not a newer version | ✅ current (Pro optional) |
| Runway | `gen4_image` | `gen4_image` | ✅ current |

**Upgrade = 2 pin strings** (Kling → omni, Flux → max). Both take the bot's existing inputs unchanged. Deploy needs a
build + `pm2 restart cto-aipa --update-env` — **deployed 13:26 UTC 22 Sep (commit `8e93895`), on Elena's go.**

## 2. Money — which accounts can render today

| Account | Runs | State (22 Sep) | Top up |
|---|---|---|---|
| **Luma** | `/visualize luma`, Director's Cut (every DC in film #7) | 🔴 **EMPTY** — log: `Luma Direct API error: {"detail":"Insufficient credits"}`; last DC `failed` | https://platform.lumalabs.ai → your project → Billing (NOT the old dream-machine page) |
| **Runway** | `/visualize runway`, `/imagine runway` | 🔴 **4 credits** (~$0.04) — `GET /v1/organization` `creditBalance: 4` | https://dev.runwayml.com → Billing |
| **Anthropic** | Atuona `/create` default (Claude Opus 5) + prompt writing | 🔴 **zero** (known, NOW.md §7) — the bot falls back to other models | https://console.anthropic.com/settings/billing |
| DeepSeek | `/create deepseek`, `/visualize deepseek` director | 🟡 **$1.93** | https://platform.deepseek.com/top_up |
| Replicate | Kling, Seedance, Wan, Grok, Flux + every engine added today | 🟡 **PREPAID credit** (corrected: it is not card-billed) — ran out once during film #8 (`Insufficient credit`); below $5 it throttles to 6 jobs/min | https://replicate.com/account/billing |
| Google | Veo 3.1, Omni, Gemini images | 🟢 postpaid Cloud billing, Veo rendered film #7's `atuona-base8` | https://console.cloud.google.com/billing |
| OpenAI | narration voice (TTS) | 🟢 TTS call returned real audio today (was "no credits" earlier) | https://platform.openai.com/settings/organization/billing |
| xAI | Grok fallback for `/create` | 🟢 key active (no balance endpoint) | https://console.x.ai |

**To make film #8 no top-up is required:** Replicate (Kling, Seedance, Flux) + Google (Veo) are funded.
Luma and Runway only matter for `/visualize luma|runway` and for Director's Cut.

## 3. Prices per second of finished video (from the vendor pages, 22 Sep)

| Engine | 720p | 1080p | with native audio |
|---|---|---|---|
| Kling 3.0 / 3.0 Omni | $0.168 | $0.224 | Omni: $0.224 (720p) / $0.28 (1080p) |
| Seedance 2.5 | $0.2312 (480p $0.1028) | — | included |
| Veo 3.1 | $0.40 | $0.40 | included · fast $0.10 · lite $0.05 |
| Omni video | ~$0.10 (token-priced) | | included |

## 4. Moderation — what the "underground sexy" register actually hits

Replicate's last 15 jobs (20 Sep): `flux-2-pro` **2 of 6 flagged** ("input or output was flagged as sensitive"),
`seedance-2.5` **1 of 3 flagged**, `kling-v3-video` 0 of 1, `flux-1.1-pro-ultra` 0 of 6. The bot already retries a
flagged still with a chiaroscuro "video-safe keyframe" — so plan every sensual shot with a second, safer phrasing.

## 5. Wired into the bot the same day (Elena: "I want them all") — LIVE 15:43 UTC

`/visualize` (12 engines + the DeepSeek director): the 6 above + **Wan 2.7**, **Grok Imagine Video 1.5**, **Sora 2 Pro** (~$2.40/clip),
**PixVerse v6**, **HappyHorse 1.0**, **Hailuo 2.3**. `/imagine` (13): Flux 2 Max, Luma, Omni, Runway + **Seedream 5 Pro**,
**GPT Image 2**, **Grok Imagine Image 2**, **Nano Banana Pro**, **Imagen 4 Ultra**, **Ideogram v4**, **Qwen Image 2512**,
**Wan 2.7 Image Pro**, **Hunyuan Image 3**. All via Replicate, named-only, fall back like the old ones, vendor safety defaults.
Commits `94ad48a`, `ec734bf`. **First live call of each is unverified** — they were compiled, schema-checked and menu-checked;
Wan and Grok rendered 17 film shots through the same inputs.

**Incident:** the 13 new lines pushed `/menu` past Telegram's 4096-char limit → `400 Bad Request: message is too long` → the bot
answered nothing. Fixed 15:49 UTC with `replyChunked()` (split at line breaks).

## 6. Venice.ai — the adult-permitting stills engine (added 22 Sep, LIVE 20:03 UTC)

Elena asked for a provider whose **own terms** permit adult work, after a nude keyframe was refused by Flux 2 (its guard
against nudity generated from a person's photo) and re-routing that refusal was blocked and removed. Checked live:

| Provider | Their own terms | |
|---|---|---|
| **Venice.ai** | "photorealistic, stylized, and **uncensored** models"; image API has `safe_mode` — "*If enabled, this will blur images classified as having adult content*" (default on, caller may disable). Bans minors and any "name, voice, image, or likeness without their consent". | ✅ wired |
| Replicate | bans "non-consensual nudity or illegal pornographic content"; says the service can produce pornographic output that it does not monitor → the blockers are the **model makers**, not the platform | 🟡 model-dependent |
| Civitai | now bans "pornography… depicting nudity or explicit sexual acts" and likenesses of real people | ❌ |
| RunPod (self-host) | lists "pornography or graphic adult content" as unauthorised, "lifetime ban" | ❌ |

**Wiring:** `/imagine venice 048` (safe mode ON) and `/imagine venice18 048` (the vendor's own `safe_mode:false`) — two
separate commands so adult mode is never hit by accident. Venice's own API (`POST /api/v1/image/generate`, base64 out,
persisted next to the video shots), never a fallback target, `VENICE_IMAGE_MODEL` default `venice-sd35`.
**Key:** `/venicekey <key>` — message deleted, key on STDIN to `/home/ubuntu/set-venice-stdin.sh` (repo copy:
`scripts/oracle-resilience/`), probed against Venice, written to `.env` with a backup; nothing written if Venice refuses it.
After a key change: `pm2 restart cto-aipa --update-env`.

**Status 22 Sep:** done and proven — `/imagine venice18 019` rendered `019-still.jpg` (0.17 MB) and `019-still-v.jpg`
(0.21 MB) on her own key, balance then `$9.9496845`. (Superseded: the earlier "no Venice call has been made yet".)

**Note for the next agent:** a nude still from Venice can enter a film the way film #8's glitches do — as a still. It cannot
be animated: Wan, Kling and Seedance each run their own check on the first frame (Seedance refused even the clothed Olympia).

### Venice troubleshooting (22 Sep, from a real failure)

- **`/models` is PUBLIC.** It returns 200 with no key at all and 200 with a fake key. The first version of
  `set-venice-stdin.sh` probed it and therefore "verified" every key handed to it — including a deliberately fake one, which
  it then wrote over Elena's real key (restored from its own backup). The probe is now a **1-token chat completion** —
  `/api_keys/*` can be admin-only and would reject a perfectly good inference key, whereas "can this key run inference?"
  is the actual question — and the script takes `VENICE_ENV_FILE` so it can be tested without touching the live `.env`.
- **Venice answers 401 for a key that cannot spend**, not 402. Elena's key is real (tail matches her dashboard) yet chat,
  image generation, `/api_keys` and `/api_keys/rate_limits` all return `401 Authentication failed`, while her account shows
  1,000 Venice Credits and the key row reads `$0.00 / $0.00 · 0.00 DIEM / mo`. So a 401 means *either* wrong key *or*
  no spend allowance — check the key's limit and whether the credits are API credits before assuming the key is wrong.

## 7. Venice VIDEO — `/visualize venice` / `/visualize venice18` (added 22 Sep, LIVE 22:34 UTC)

Elena: *"If it worked wire venice into imagine and visualise commands inside bot."* Stills were already live; this is the
video half. **Verified with a real paid render, not a compile.**

**Venice video is not shaped like every other engine here.** Three differences, each one a trap:

1. **It is a queue, not a call.** `POST /video/quote` → `POST /video/queue` (`{queue_id}`) → poll `POST /video/retrieve`
   until it stops answering JSON `{status:"PROCESSING"}` and answers **the mp4 bytes**. Measured: `est 466s`, actually
   **119s** for 5s @720p.
2. **It hands back BYTES, not a URL.** Every other provider returns a hosted link. The bytes are written into the shots
   dir via the existing `persistShotBytes()` under a **prefixed** stem (`venice-<page>-<ts>`) so they can never land on
   `{pageId}.mp4` and overwrite the base cut `/film build` reads, then served back as our own `/films/shots/…` URL.
   Downstream (delivery, persistShot, Director's Cut) is unchanged.
3. **The start frame goes as an inline data URI, never as our shots URL** — that URL carries `ATUONA_FILMS_KEY` in the
   query string, and a key does not belong in a third party's request log.

**Verified 22 Sep 22:35 UTC** (start frame `019-still.jpg`, the Venice still from earlier the same day):

| | |
|---|---|
| quote | `{"quote":0.52}` → **$0.52** |
| queue | `200 {"model":"wan-3-0-image-to-video","queue_id":"01a0cb41-…"}` |
| render | **119s** (Venice's own estimate said 466s) |
| output | **5.20 MB**, `h264 1280x720 30fps`, **5.038s**, **with an AAC audio track** (Wan 3.0 scores natively) |
| balance | `9.9496845` → **`9.429369`** — moved by exactly the quoted $0.52 |

### ⚠️ The cap that was not a cap

The runner quotes before queueing and refuses anything over `VENICE_VIDEO_MAX_USD` (default $3). Written from the docs,
it read `price_usd` / `cost_usd` / `usd` / `price`. **Venice actually answers `{"quote":0.52}`** — a bare dollar number
under `quote`. Every one of those reads was `undefined`, the value fell through to `NaN`, `Number.isFinite(NaN)` is
false, and the cap passed **every** price through in silence. It only surfaced because the probe printed the raw body.
A guard that reads a field the vendor does not send is not a guard; it is a guard-shaped comment. Fixed and redeployed.

### The 18 in `venice18` does NOT mean the same thing here as in `/imagine`

For stills, `venice` vs `venice18` is one documented switch: the vendor's own `safe_mode`. **The video API has no such
flag.** Venice instead marks models in `/models` — `model_spec.uncensored: true`, on **44 of 138** video models
(22 Sep), the whole Wan 3.0 family among them. So on `/visualize` the two commands differ by **model tier**:

- `/visualize venice <page>` → `wan-3-0-image-to-video`, 720p
- `/visualize venice18 <page>` → `wan-3-0-pro-image-to-video`, 1080p (the family also offers 2K/4K)

`venice18` is a label of **intent and cost**, not a different filter, and Venice's own content policy still applies to
both (HTTP 422 `content violation`). Do not "fix" this into a safe/adult pair — it would be a lie in the menu.

Env knobs: `VENICE_VIDEO_MODEL`, `VENICE_VIDEO_PRO_MODEL`, `VENICE_VIDEO_RESOLUTION`, `VENICE_VIDEO_DURATION` (default
`5s`), `VENICE_VIDEO_ASPECT` (`16:9`), `VENICE_VIDEO_MAX_USD` (`3`), `VENICE_VIDEO_TIMEOUT_MS` (`900000`).
**Cost note:** $0.52 per 5s ≈ **$0.104/s** — roughly Sora-2-Pro territory and ~7× Grok. A 3-minute film of Venice video
would be ~$19, so this is the engine for the shots that need it, not the default.
