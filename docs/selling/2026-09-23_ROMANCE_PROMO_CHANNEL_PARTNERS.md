# Romance promo companies — channel partners for cinematic book trailers

**23 Sep 2026.** Researched with Elena in a Claude Code session. Status: **not contacted yet.**

## The idea in one line

Romance promo companies already have authors paying them every week. Offer them a
cinematic 30-second book trailer in the Atuona style (dark, luxury, implied, never
explicit) that they sell to their authors. They have the demand; we have the production.

**Partner test (why this is not the failed partnerships again):** do they have paying
buyers *today*, or do they want buyers *from us*? Every company below sells to authors
weekly — that is on their own public pages.

## Two offer shapes — use the one that fits the company

| Shape | For | The offer |
|---|---|---|
| **A. Menu item / revenue share** | Shops that sell à-la-carte promos (blitzes, cover reveals, newsletter slots) | "Add a cinematic trailer to your menu. I produce, you sell, we split." |
| **B. White-label subcontractor** | Full-service PR agencies that only take full-time clients | "I produce trailers under your brand for your clients; you pay a wholesale price and bill what you like." |

## Targets — ranked by fit

| # | Company | Why it fits | Shape | Where to reach them |
|---|---|---|---|---|
| 1 | **Dark Romance Reads** | Dark-romance only; sells $10 bookings with 5-day lead time | A | https://darkromancereads.com/dark-romance-book-promotions/ |
| 2 | **Xpresso Book Tours** | Runs dark-romance release blitzes (public sign-up pages) | A | https://xpressobooktours.com/2024/05/14/blitz-sign-up-dangerous-allure-a-dark-romance-anthology/ |
| 3 | **Give Me Books Promotions** | Romance-only; books 6+ weeks ahead | A | https://givemebooksblog.blogspot.com/p/promotions.html |
| 4 | **Enticing Journey Book Promotions** | Romance-heavy; public services menu | A | https://www.enticingjourneybookpromotions.com/p/services_26.html |
| 5 | **Social Butterfly PR** | Full-service; lists Erotic Romance and Romantic Suspense | B | https://www.facebook.com/SocialButterflyBooks · https://www.tiktok.com/@socialbutterflypr |
| 6 | **Valentine PR / Grey's Promotions** | Full-time clients only, no à-la-carte; already make "teasers to ads" graphics — video is the next step | B | https://valentinepr.net/ · https://greyspromo.com/ |
| 7 | **Wordsmith Publicity** | Romance PR; makes "promotional materials" for clients | B | https://wordsmithpublicity.com/services/ |
| 8 | **BookMojo** | Blitzes and cover reveals, 2-week booking | A | https://book-mojo.com/product/blitz/ |

Lower fit (ad/newsletter platforms, not service shops): romance.io
(https://www.romance.io/romance-book-promotion), Pillow Talk Books / CraveBooks
(https://pillowtalkbooks.com/book-promotion-services/).

## Order of work

1. **Sample first — nothing is sent without it.** A 30-second vertical (9:16) trailer cut
   from *Crimson Escape* (film #8), framed as a Kira-and-Ule dark romance. Existing
   footage only, no new credits.
   **✅ Cut 23 Sep:** `crimson-escape-book-trailer-sample-9x16.mp4`, 31.8 s, 1080x1920,
   h264 + AAC, 33.7 MB. On Elena's Desktop and on Oracle `~/trailer-sample/` with its
   `build.sh` (re-runnable: 9 raw shots from film #8, two voice lines with captions,
   title card, end card "Your book deserves a film · cinematic book trailers ·
   atuona.xyz", film #8's Pixabay music ducked under the voice).
   **✅ v2 approved by Elena 24 Sep** ("It is good") after one change: lettering is now
   dark-luxury — Cinzel (letter-spaced caps) for titles, Cormorant Garamond italic for
   captions, ivory `#EDE3D1` + crimson `#C8323F` (both Google Fonts, OFL — free for
   commercial use; in `~/trailer-sample/fonts/`). v1 script kept as `build.v1.sh`.
   Delivered to her via the Atuona Telegram bot (the Claude app cannot deliver files).
   **v3 (24 Sep, Elena):** end card points to `atuona.xyz/aifilmstudio`, not `atuona.xyz`; end card 4.2 s, total 32.7 s. v1/v2 scripts kept as `build.v1.sh`/`build.v2.sh`. An unlisted Short of v2 exists (superseded) — v3 needs its own upload.
   **Next: a public link.** Do NOT drop it into `data/atuona/films/out/` — `/films` lists
   that folder, so it would appear in the public gallery as film #9.
2. **Hard cap (Elena, 23 Sep): maximum 5 targets.** #1–#4 (shape A) and #5 Social
   Butterfly PR (shape B). #6–#8 are reserves only — used to replace a target that
   closes or has no reachable contact, never added on top. Follow-ups to the same five
   do not count as new outreach.
3. Log each as a HubSpot deal the day it is sent, with **follow-ups scheduled as HubSpot
   tasks before the first send: day 0, day 5, day 12.** One touch then silence is what
   killed CLIENT-MANUAL and CLIENT-ATLAS (`2026-09-23_CLIENT_STREAMS_AUDIT.md`).
4. **Stop rule, 30 days after the last send:** at least one yes (menu, white-label, or a
   paid trial). Otherwise drop the channel.

## Pricing — a starting guess to test, not a verified number

- Their authors pay **$10–$40** for a promo slot (their own public prices), so a trailer
  must feel like a small upgrade, not a new budget line.
- Starting point: **wholesale ~$60–90 for 30 s**, the partner resells at whatever they
  choose. Credit cost per 30 s is a few dollars on the Wan/Grok mix.
- Adjust after the first two replies. Do not publish a price anywhere until one partner
  has reacted to it.

## Draft message (shape A — edit the first line per company)

> Subject: A cinematic trailer for your dark-romance authors
>
> Hi [name],
>
> I've seen your [blitzes / cover reveals] for dark-romance releases. I make short
> cinematic book trailers in exactly that mood — dark, luxurious, sensual, never
> explicit. 30 seconds, vertical, ready for TikTok and Reels. Here is one: [sample link].
>
> Would you like to add trailers to your menu? I produce them, you sell them to your
> authors, and we share the revenue. I can make the first one free for one of your
> upcoming releases, so you can see how your authors react.
>
> Elena Revicheva — poet and AI film director · AI Film Studio: atuona.xyz/aifilmstudio
> Portfolio: aideazz.xyz/portfolio
>
> P.S. I also make AI music videos and short brand films in the same style, if any of
> your authors need launch visuals beyond the trailer.

### Personalised first lines (the rest of the message stays as above)

1. **Dark Romance Reads** — "Your whole list is dark romance, so I'll keep this short: your
   authors' covers already sell the mood; a 30-second film sells it on TikTok."
2. **Xpresso Book Tours** — "I saw your dark-romance blitz sign-ups. A blitz is a week of
   posts; a trailer is the one post that moves."
3. **Give Me Books Promotions** — "You book romance promos six weeks ahead, which is exactly
   the lead time a trailer needs."
4. **Enticing Journey Book Promotions** — "Your services page has everything an author
   needs for launch week except a film."
5. **Social Butterfly PR** (shape B) — "You represent erotic romance and romantic suspense
   authors. I make trailers in that register — sensual, never explicit — under your brand."

**Shape B change:** replace the second paragraph with "I can produce trailers under your
brand for your clients, at a fixed wholesale price, and you bill them as you like."

## Line that does not move

Implied, never explicit. Original characters only — never a real person's face, likeness
or photo. That keeps the product on normal payment rails and safe for Elena's job search.
