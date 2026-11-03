# EspaLuz promotion machine — what it does today, what is unconnected (3 Nov 2026)

Read-only audit: Influencer code + Oracle logs + Make API (GET only; rate-limited midway, so no per-scenario credit
totals). Elena's constraints: no ad money, no manual posting, paid Make Core (10,000 credits/mo, ~19% used).

## 1. The machine today (7 days, from logs + Make history)
| Lane | Trigger | Path | 7-day real output |
|---|---|---|---|
| Daily photo post | Influencer `main.py:2080`, 23:00 UTC daily | `MAKE_WEBHOOK_URL` → 3044021 → Buffer → **Elena's personal IG + LinkedIn** | 7 runs ok (28 ops); **EspaLuz only 1 day in 3** (`get_campaign_type_for_date`: `toordinal() % 3 == 2`), other days GEO/AIGO |
| EspaLuz Facebook Page photo | same, EspaLuz days only | `MAKE_FACEBOOK_WEBHOOK_URL` → 6868765 | 1 scheduled post (2 Nov 23:00) + 3 setup tests; ≈2 posts/week; only 6 images rotate |
| Video (FB + YT Short + IG Reel) | **only when Elena sends a video** to the bot | `MAKE_VIDEO_WEBHOOK_URL` → 6869112 | 2 runs (hers, 2 Nov); files deleted after 3 days; nothing automatic feeds it |
| YouTube | — | conn 5453399 = same channel as AIGO business films | mixed channel |

TikTok, Pinterest, WhatsApp Channels: nothing.

## 2. Built but not connected
1. **27 Pere & Titi clips never posted** — `ascent-saas-builder/public/heroes/` (25 × 5 s silent loops + `kids-greeting.mp4` 18 s
   with sound) + Gemini Pere/Titi voices in `docs/espaluz/voice-samples/`. Needs stitching into vertical 15–20 s clips (ffmpeg;
   laptop render — never on Oracle, iron rule).
2. **Video-of-the-day uploader exists, OFF:** 6263197 "Daily YouTube Upload" (off since 28 Oct). 6505010 dated-file → Buffer
   calendar idles (last file 12 Oct). Cheapest wiring: a queue folder on Oracle + one cron line that sends one queued video
   a day to the EXISTING 6869112 webhook — no new scenario.
3. **21 country pages unused as post content** (local word / how-it-works); classroom photo + her Grok stills not in the image pool.
4. **Facebook Page gets EspaLuz 1 day in 3** — one modulo rule.
5. **Pinterest**: native Make "Create a Pin" module, no connection — Elena's one OAuth click.
6. **Credit waste:** 6518503 (thumbnails for the OFF uploader, daily) + 6505010 idle ≈ 2 credits/day (estimate).
7. "Lead Concierge" 5633833 every 15 min — likely the main credit user (not measured).

## 3. Where relocating families actually are (honest)
- **Facebook Groups**: strongest, but no API posting since 2024 → not automatable.
- **Facebook Page**: right audience, near-zero organic reach for photos on a new Page; **Reels** are the format shown to non-followers.
- **Instagram**: posts land on her personal account (wrong audience); Reels still reach strangers.
- **YouTube Shorts**: reaches non-followers + search ("moving to Panama with kids"); diluted by sharing the AIGO channel.
- **TikTok**: likely best for kids characters, locked in Buffer free plan, no Make module.
- **Pinterest**: search-driven, long-lived, used by move planners; a zero-follower account still gets found.
- **WhatsApp Channels**: no API.

**Bottom line:** only short VIDEO (Reels/Shorts) and Pinterest put a zero-follower account in front of strangers.

## 4. Top 5 moves with existing scenarios + existing content (arrivals are judgement, not measured)
1. **Daily Pere & Titi Short/Reel on autopilot** via the existing 6869112 (queue + cron). ≈5 credits × 30 = **~150 credits/mo**.
2. **EspaLuz on the Facebook Page every day** with country-card content through 6868765. ≈**90 credits/mo**.
3. **Pinterest pins** for 21 country pages + clips (after Elena's click). ≈**60 credits/mo**.
4. **Re-post existing videos** (her 2 Grok videos, `kids-greeting.mp4`) on a 7–10 day rotation; keep queued files past 3 days. ≈**15 credits/mo**.
5. **Clean waste / wrong targets**: switch off idle 6505010 + 6518503 (≈60 credits back), stop routing EspaLuz photos to
   LinkedIn, consider a separate EspaLuz YouTube channel. 0 credits.

All five: **< 400 credits/mo (~4% of plan). Credits are not the limit; reach is.** Measure with the Monday
`scripts/espaluz-funnel-weekly.mjs` report.

Files: `EspaLuz_Influencer/main.py` (955–967, 1365–1420, 1459–1540, 2080); `ascent-saas-builder/public/heroes/`;
`docs/espaluz/voice-samples/`; `scripts/make-6263197-lane-audit.cjs` (Make API pattern);
Oracle `/var/www/influencer-images/{espaluz-videos,ig-aigo/posts,youtube}`.
