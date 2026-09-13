# /api promo → YouTube + social (Make scenario `6262353`)

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
