# /api promo → YouTube + social (Make)

## STATE, 4 Oct 2026 — NEW scenario `6505010` "AIGO Films → Instagram Reels" (6263197 NOT touched)

Elena: "Better create new one for insta". Created via `POST /scenarios?confirmed=true`, activated (`/start`), run once via the API (`POST /run`, logged as type `auto`):
2 ops, Buffer post "sent" → https://www.instagram.com/reel/DeErTwenLT7/ (4 Oct 12:52 UTC). Daily 12:00 Panama (17:00 UTC).
Module 1 `http:ActionSendData` GET `https://webhook.aideazz.xyz/influencer-images/ig-aigo/posts/{{formatDate(now; "YYYY-MM-DD"; "America/Panama")}}.json`
(handleErrors off, so a 404 is a normal result) → filter `{{1.statusCode}} = 200` → module 2 POST `https://api.buffer.com`,
raw JSON body `{{toString(1.data)}}` = the pre-built `createPost` request (Bearer token inline, the Lead Concierge pattern).
Calendar = the files (6 / 8 / 10 / 12 Oct); posted days are renamed `.json.posted`. Blueprint, token redacted:
`docs/selling/video/make/6505010_aigo_films_instagram_reels_2026-10-04_REDACTED.json`. Full runbook + captions:
`docs/selling/video/AIGO_INSTAGRAM_REELS.md`. Stop: toggle off in Make or `POST /scenarios/6505010/stop`.

## STATE, 3 Oct 2026 (evening) — `6263197` now ROTATES 5 FILMS (Elena: "wire this exact video in make com scenario for daily rotación alongside other videos wired today")

PATCH 200, `isinvalid: false`, active, next run 4 Oct 14:15 UTC. `filmIndex = parseNumber(formatDate(now; "DDD")) % 5`; routes 0-3 unchanged
(yacht · /api · villa · relocation), filters renamed "% 5". **Route 4 (new):** `http:ActionGetFile`
`https://webhook.aideazz.xyz/influencer-images/youtube/aigo-film-5-medtour.mp4` (= film #5 **v3** master, md5 `3d1849e4f70c45ccd5ad2c55a8497d6d`,
copied to `/var/www/influencer-images/youtube/`, HTTP 200 video/mp4) → `youtube:uploadVideo` v4 with the film-5 title, the v3 description
(disclosure lines first, ElevenLabs music credit) and 14 tags; containsSyntheticMedia true, not for kids, public — copied from route 3.
Day-of-year % 5 order: 4 Oct (277) = villa · 5 Oct = relocation · 6 Oct = medical tourism · 7 Oct = yacht · 8 Oct = /api.
Backup before the change: `docs/selling/video/make/6263197_daily_youtube_upload_BACKUP_before_5films_2026-10-03.json`; the new one:
`…_5FILMS_2026-10-03.json`. Same accepted risk as below (repetitive daily uploads); the first lever is still to stop the scenario.

## (superseded) STATE, 3 Oct 2026 — `6263197` Daily YouTube Upload now ROTATES THE 4 AIGO FILMS (Elena's call)

Elena (3 Oct): "promote these 4 new videos rotating them every day … all other older videos should be removed from the
scenario." The v13/v19 /api cuts are out. Flow (PATCH 200, `isinvalid: false`, active, daily 09:15 Panama = 14:15 UTC):
`util:SetVariable2` filmIndex = `parseNumber(formatDate(now; "DDD")) % 4` → `builtin:BasicRouter`, one route per film
(filter `filmIndex = k`): `http:ActionGetFile` → `youtube:uploadVideo` v4 (conn `5453399`) with that film's own title,
description and tags from `docs/selling/video/2026-10-01_AIGO_YOUTUBE_UPLOAD_SHEET.md`, public, not for kids,
`containsSyntheticMedia: true`. **VERIFIED on the first run, 3 Oct 14:15 UTC:** log status SUCCESS, 3 operations, transfer
42,844,900 B (= `aigo-film-1-yacht.mp4` 42,838,637 B), public video `RsKJX3SKgiw` published 14:15:19 UTC (channel RSS), and the watch
page shows "How this was made — Sounds or visuals were altered or fully generated · Made with AI". Next run 4 Oct = filmIndex 1 (/api).

| filmIndex | film | file (`/var/www/influencer-images/youtube/`, public via webhook.aideazz.xyz) | md5 = the published master |
|---|---|---|---|
| 0 | yacht | `aigo-film-1-yacht.mp4` | `89e91e42…` |
| 1 | /api merged | `aigo-film-2-api.mp4` | `28d5b971…` |
| 2 | villa + charter | `aigo-film-3-villa.mp4` | `7253d8df…` |
| 3 | relocation v2 | `aigo-film-4-relocation.mp4` | `5ab513a8…` |

Backup of the previous 2-module blueprint: `docs/selling/video/make/6263197_daily_youtube_upload_BACKUP_2026-10-03.json`;
the new one: `…_4FILMS_2026-10-03.json`. **⚠️ Risk Elena accepted knowingly:** the channel already holds ~60 near-identical
daily re-uploads (many "Potential earning limitation") and an active Community Guidelines warning; YouTube's spam policy covers
repetitive uploads. If a strike arrives, the first lever is to switch this scenario off (Make UI toggle or PATCH
`/scenarios/6263197/stop`). Custom thumbnails are not set by this module (YouTube auto-picks a frame).


## STATE, 13 Sep 2026

| scenario | state | does |
|---|---|---|
| `6262097` **Daily YouTube Promotion via Buffer** | **ACTIVE**, daily 09:00 (14:00 UTC) | Buffer → LinkedIn + Instagram, rotating the two YouTube links by day-of-month parity. **Proven: both channels returned `sent`.** |
| `6263197` **Daily YouTube Upload — NEEDS a working YouTube connection** | **STOPPED** | `youtube:uploadVideo` v4, unmapped. Blocked on OAuth, see below. |

## 🚫 ALL FOURTEEN YouTube connections in Make are DEAD

`POST /connections/{id}/test` returns **424** *"The request failed due to failure of a
previous request"* for every one of them (`5473103, 5473760, 5473773, 5473982, 5474427,
5474448, 5476318, 5485601, 5485605, 5487504, 5487585, 5487596, 5487612, 5487643`).

**The control proves the endpoint is fine**, not the test: telegram ×6, buffer ×3 and
hubspotcrm all return **`200 {"verified": true}`** through the same call. That is almost
certainly why there are fourteen — each one broke, another was made, none was ever
verified.

**Only Elena can fix this** (Google OAuth consent, credential boundary):
Make → Connections → Add → YouTube → sign in → Allow. **One** working connection is
enough; the other thirteen should be deleted.

## ✅ The YouTube module identifier, finally

**`youtube:uploadVideo`, version 4.** Make accepts it (`PATCH` 200).

Nineteen name/version guesses failed first. The way to get it is **the public template
library**, which is readable over the API when `/apps*` is not:

```
GET /templates/public?pg[limit]=100&pg[offset]=N   → find one whose usedApps has "youtube"
GET /templates/public/{id}/blueprint               → real module names + versions
```
Template `11079` ("Upload new videos to YouTube and LinkedIn automatically") yields
`google-sheets:watchRows, google-drive:getAFile, youtube:uploadVideo, linkedin:createVideoPost`.
Note `/templates/{id}/blueprint` (non-public) returns 403 — use the `public` path.

## 🚫 Buffer's API CANNOT publish landscape video to YouTube

Verbatim, after fixing two earlier errors it raised (`categoryId` required, then
`thumbnailUrl` unsupported):

> **"Video must be vertical (portrait orientation) for YouTube Shorts."**

Buffer's YouTube path is **Shorts only**. Every cut is 1920×1080 landscape, so Buffer is
right for LinkedIn/Instagram promotion and cannot be the YouTube uploader. Two ways
forward: render 1080×1920 portrait cuts for Shorts, or use `youtube:uploadVideo` once a
connection exists.

Also note the legacy Make module `buffer:ActionCreateStatus` v2 has **no YouTube title
field** — Buffer returns *"You have to add a title to your YouTube video."* and extra
mapper keys are ignored. The title only exists on the newer Buffer GraphQL API, under
`metadata.youtube.title` (`YoutubePostMetadataInput`: categoryId, embeddable,
isAiGenerated, license, madeForKids, notifySubscribers, privacy, title).

---

# Original build note (scenario `6262353`, since deleted as redundant)

Built 13 Sep 2026 over the Make REST API from Oracle. **Created OFF. Nothing has been
published.**

| | |
|---|---|
| Scenario | `6262353` — *AIdeazz — /api promo → YouTube + social* |
| Team / org | `938264` / `4092825` (us2) |
| Hook | `2809555` — `aideazz-api-promo` |
| Webhook URL | `https://hook.us2.make.com/n78wclxkur1g5huj19hm3942y8t7viq6` |
| State | `isActive: false`, `isinvalid: false` (Make validated the blueprint) |

## Flow

1. `gateway:CustomWebHook` — fire it with a JSON body, one video per call.
2. `buffer:ActionCreateStatus` → **YouTube** channel `68389437d6d25b49a1665d44`
   ("AIPA Era is Minted"), `useMedia: true`, `media.link` = the mp4 URL.
3. `buffer:ActionCreateStatus` → **LinkedIn** `68389647d6d25b49a18a0de2` +
   **Instagram** `68389b15d6d25b49a1d75b8e`, text only, link carries the UTM.

All three Buffer channel ids were re-verified live on 13 Sep — TikTok is still
`isLocked: true` (plan limit) and is deliberately not wired.

## Firing it

```bash
curl -X POST https://hook.us2.make.com/n78wclxkur1g5huj19hm3942y8t7viq6 \
  -H 'Content-Type: application/json' \
  -d '{
    "videoURL": "https://webhook.aideazz.xyz/influencer-images/youtube/can-ai-find-and-cite-you-v19.mp4",
    "videoTitle": "Can AI find and cite you? — free 34-signal audit",
    "videoDescription": "Run the free audit: https://aideazz.xyz/api?utm_source=youtube&utm_medium=video&utm_campaign=api-audit-cta",
    "thumbnailURL": "https://webhook.aideazz.xyz/influencer-images/youtube/can-ai-find-and-cite-you-v19-poster.jpg",
    "socialText": "Google ranked your page. In 2026 that is half the fruit. Free 34-signal AI visibility audit → https://aideazz.xyz/api?utm_source=linkedin&utm_medium=buffer_cmo&utm_campaign=api-audit"
  }'
```

The two videos in scope:

| cut | URL suffix | length | notes |
|---|---|---|---|
| v19 | `can-ai-find-and-cite-you-v19.mp4` | 1:03 | current — generated fruit + real walkthrough |
| v13 | `can-ai-find-and-cite-you-v13.mp4` | 1:55 | older cut, Elena asked to promote it too |

## ⚠️ The open risk — Buffer's YouTube integration is SHORTS

Buffer publishes to YouTube as **Shorts**, which are vertical. Every cut here is
**1920×1080 landscape** (v13 1:55, v18 0:49, v19 1:03), and a 1:55 runtime is over the
Shorts limit as well. So step 2 may be rejected by Buffer or by YouTube.

**This is untested — it cannot be known without one real publish.** If Buffer refuses
the landscape file, the fix is not Buffer: it is Make's own YouTube *Upload a Video*
module against one of the ten `youtube` connections already in the account
(`5474427`, `5474448`, `5476318`, `5485601`, `5485605`, `5487504`, `5487585`,
`5487596`, `5487612`, `5487643` — all unused by any scenario today).

That module's exact name could not be discovered over the API: `/apps`,
`/apps/youtube/modules` and every sibling path 404, and `/sdk/apps` lists only custom
apps (empty). It has to be read off one scenario built by hand in the UI, once.

## 🪤 Trap — Make's edge blocks python `urllib`

Probing the Make API with `urllib.request` returns **403 `error code: 1010`** on every
endpoint and for `Authorization: Token`, `Bearer` **and** `x-imt-api-key` alike. That
looks exactly like a dead token and it is not — it is the default `Python-urllib/3.x`
User-Agent being refused at the edge. The same token over node `fetch` returns **200**.

**Identical failure across three different auth schemes is not an auth problem.** Use
node `fetch` (as `src/concierge-watchdog.ts` already does), or set a browser UA.

## 🔎 Latent, not currently firing

`checkMakeHealth()` in `src/concierge-watchdog.ts` returns `idle` (`ok: true`) on any
non-2xx from Make and writes **no** verdict, so the previous `can: true` stays sticky.
A missing token is handled correctly (`writeMakeVerdict(false, …)`); a *rejected* one is
not. If Make auth ever breaks, the watchdog keeps vouching for Make and Oracle will not
take over drafting. Verified healthy today (`data/make-can-draft.json`,
`"healthy — last run 35 min ago"`), so this is a latent hole, not a live outage.
