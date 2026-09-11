# YouTube — Can AI find and cite you?

Promo + product walkthrough for **https://aideazz.xyz/api**
Compiled with the Atuona Film Studio stack already wired into this repo
(Runway Gen-4.5 image→video, onyx TTS, ffmpeg xfade / ducked music). Luma is burned.

**Do not drop this file into `atuona.xyz/aifilmstudio`.** That gallery is poetry.

## Length (this cut)

VO and captions are unchanged. Grapevine shot is gone. Fruit labels (Google / ChatGPT, bot names) are burned onto the picture, not spoken. New shorter Loom. QR outro.

## Watch

Open a filename Chrome has never cached:

Player (QR is a real clickable link on this page):
https://webhook.aideazz.xyz/influencer-images/youtube/watch.html

Direct file (open this, not v5 / v4 / v3):
https://webhook.aideazz.xyz/influencer-images/youtube/can-ai-find-and-cite-you-v6.mp4

Poster:
https://webhook.aideazz.xyz/influencer-images/youtube/can-ai-find-and-cite-you-poster.jpg

## Publish (Elena, YouTube Studio)

1. Title: `Can AI find and cite you? Free visibility audit in 30 seconds`
2. Thumbnail: `scripts/youtube-api-audit-film/youtube_api_audit_thumbnail.png`
3. Paste the description below. First two lines are the hook + the URL.
4. Visibility: Public. Category: Science & Technology.
5. End screen: last ~7 seconds are the QR. Add a YouTube **End screen → Website** over it, linking `https://aideazz.xyz/api?utm_source=youtube&utm_medium=video&utm_campaign=api-audit-cta`. A QR inside an mp4 is scannable, not clickable — the end screen is the click.
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

Music: Chillout Lounge - Chillout Enigmatic Music by Oleg-Mazur (Pixabay, mood Uplifting). Tropical Cocktail and Distant Horizon are burned.

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
