# YouTube — Can AI find and cite you?

Promo + product walkthrough for **https://aideazz.xyz/api**
Compiled with the Atuona Film Studio stack already wired into this repo
(Runway Gen-4.5 image→video, onyx TTS, ffmpeg xfade / slow-mo / ducked music).

**Do not drop this file into `atuona.xyz/aifilmstudio`.** That gallery is poetry.

## Watch

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

AIdeazz Lab · Elena Revicheva
```

### Chapters

```
0:00 Can AI find and cite you?
0:05 Half of the fruit
0:12 Six crawlers
0:20 What the product is
0:28 Paste a URL
0:36 The score
0:48 All 34 checks
1:00 Four categories
1:10 Run yours — aideazz.xyz/api
```

Adjust timestamps after you watch the cut.

### Tags

`AI visibility, GEO, AEO, ChatGPT SEO, Perplexity, Claude, Gemini, llms.txt, JSON-LD, AI crawlers, GPTBot, free SEO audit, AIdeazz`

## Rebuild

```
# first line of .influencer-diag-trigger
api-film
```

Oracle work dir `/home/ubuntu/aideazz-api-film/` (never inside the repo).
Does not restart cto-aipa, influencer, or vibejobhunter.
