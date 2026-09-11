# YouTube — Can AI find and cite you?

Promo + product walkthrough for **https://aideazz.xyz/api**
Compiled with the Atuona Film Studio stack already wired into this repo
(Runway Gen-4.5 image→video, onyx TTS, ffmpeg xfade / slow-mo / ducked music).

**Do not drop this file into `atuona.xyz/aifilmstudio`.** That gallery is poetry.

## Length (this cut)

**79 seconds** (1:19). That is the usual length for a YouTube promo that also teaches the product: hook in the first 3s, what it is, how it works, hard CTA.

Shorter than 30s is a Short or an ad — no room to show the form. Two to three minutes is an explainer; retention usually dies unless someone searched for a tutorial. Production on this stack is minutes on Oracle (Runway 5s clips + ffmpeg), not a shoot day.

Verified 11 Sep 2026, Actions `34616631936`: Elena's muted Loom + live `/api` stills, bed **Tropical Cocktail** by The_Mountain. 40.6MB, 79s, 1920×1080 30fps, AAC, HTTP 200. VO and captions unchanged. Morning Light was too calm and is burned.

## Watch

The filename ending in `.mp4` (no `-v2`) is stuck for up to 24h in any browser that already played it. Nginx used to send `Cache-Control: public, max-age=86400`. Ctrl-R will not help. Open one of these instead:

Player (always fetches the new cut):
https://webhook.aideazz.xyz/influencer-images/youtube/watch.html

Direct file (new cache key):
https://webhook.aideazz.xyz/influencer-images/youtube/can-ai-find-and-cite-you-v2.mp4

Dated copy:
https://webhook.aideazz.xyz/influencer-images/youtube/can-ai-find-and-cite-you-20260911.mp4

The first ~40 seconds still open on grapes — VO and captions were not changed. Skip to **0:42** for the live `/api` walkthrough. Soundtrack is Tropical Cocktail (not the sad piano).

Unversioned (stale in browsers that already opened it; incognito works):
https://webhook.aideazz.xyz/influencer-images/youtube/can-ai-find-and-cite-you.mp4

Poster (frame 0 = title card, never black):
https://webhook.aideazz.xyz/influencer-images/youtube/can-ai-find-and-cite-you-poster.jpg

## Publish (Elena, YouTube Studio)

1. Title: `Can AI find and cite you? Free visibility audit in 30 seconds`
2. Thumbnail: `scripts/youtube-api-audit-film/youtube_api_audit_thumbnail.png`
3. Paste the description below. First two lines are the hook + the URL.
4. Visibility: Public. Category: Science & Technology.
5. End screen: subscribe + link to `https://aideazz.xyz/api?utm_source=youtube&utm_medium=video&utm_campaign=api-audit-cta`
6. Pinned comment: the same URL.

### Description (paste)

```
Your customer asked ChatGPT. If the model cannot cite you, you were never in the room.

Free AI visibility audit — paste any URL:
https://aideazz.xyz/api?utm_source=youtube&utm_medium=video&utm_campaign=api-audit-cta

WHAT IT IS
Google ranked your page. In 2026 that's just half of the fruit.
Six crawlers decide whether ChatGPT, Claude, Gemini and Perplexity can quote your site.
We read the page directly and score all 34 signals. No signup. No scraping bill.

HOW IT WORKS
1. Open aideazz.xyz/api
2. Paste a public URL
3. Click Audit my site
4. Get a score, which engines can read you, and every check with why it matters + how to fix it

Counted from production logs on Oracle Cloud: 420+ audits · 14,000+ signals · 210+ sites · median 85.

Want it wired into your stack? https://aideazz.xyz/portfolio#portfolio-inquiry-form

Music: Tropical Cocktail by The_Mountain — Pixabay Content License (instrumental, no vocals)

AIdeazz Lab · Elena Revicheva
```

### Chapters

Computed from beat durations + 1.3s xfade. Watch once and nudge if a line lands a second early.

```
0:00 Can AI find and cite you?
0:03 Half of the fruit
0:13 Six crawlers
0:20 What the product is
0:25 Paste a URL
0:33 Audit my site
0:38 The score lands
0:45 Which engines can read you
0:52 All 34 checks
1:01 Four categories
1:09 Run yours — aideazz.xyz/api
```

### Tags

`AI visibility, GEO, AEO, ChatGPT SEO, Perplexity, Claude, Gemini, llms.txt, JSON-LD, AI crawlers, GPTBot, free SEO audit, AIdeazz`

## Rebuild

```
# first line of .influencer-diag-trigger
api-film
```

Oracle work dir `/home/ubuntu/aideazz-api-film/` (never inside the repo).
Does not restart cto-aipa, influencer, or vibejobhunter.
