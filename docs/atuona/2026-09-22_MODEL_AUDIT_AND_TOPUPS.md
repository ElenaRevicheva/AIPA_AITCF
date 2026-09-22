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
build + `pm2 restart cto-aipa --update-env` — **not done yet, waiting for Elena's go.**

## 2. Money — which accounts can render today

| Account | Runs | State (22 Sep) | Top up |
|---|---|---|---|
| **Luma** | `/visualize luma`, Director's Cut (every DC in film #7) | 🔴 **EMPTY** — log: `Luma Direct API error: {"detail":"Insufficient credits"}`; last DC `failed` | https://platform.lumalabs.ai → your project → Billing (NOT the old dream-machine page) |
| **Runway** | `/visualize runway`, `/imagine runway` | 🔴 **4 credits** (~$0.04) — `GET /v1/organization` `creditBalance: 4` | https://dev.runwayml.com → Billing |
| **Anthropic** | Atuona `/create` default (Claude Opus 5) + prompt writing | 🔴 **zero** (known, NOW.md §7) — the bot falls back to other models | https://console.anthropic.com/settings/billing |
| DeepSeek | `/create deepseek`, `/visualize deepseek` director | 🟡 **$1.93** | https://platform.deepseek.com/top_up |
| Replicate | Kling, Seedance, Flux (all images) | 🟢 card-billed, last success 20 Sep 23:32 | https://replicate.com/account/billing (no top-up; it bills the card) |
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
