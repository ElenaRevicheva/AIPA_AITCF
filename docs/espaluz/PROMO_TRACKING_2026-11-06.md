# Promo tracking: view to click to user (6 Nov 2026)

Elena: "not just publish but track who will actually watch this and click the product links, otherwise it will be like with
AI Growth Operator videos." Status: film 01 published 22:42 UTC. Tracking below is NOT wired yet, except where marked.

## What happened last time (read today, counts only)
| Measure | Number | Source |
|---|---|---|
| AI Growth Operator films re-uploaded by Make 6263197, 21-28 Oct | 0 to 5 views each | YouTube Studio, Content |
| Channel views, last 28 days | 303.8K, source of those views not read | Studio dashboard |
| Sessions from `youtube.com` to aideazz.xyz, 90 days | 43, with 3 key events on tagged `api-audit-cta` from 7 more | GA4 |
| Sessions tagged `buffer / api-promo`, 90 days | 28, with 3 key events | GA4 |
| EspaLuz Short of 2 Nov | 1,229 views | Studio |
| Arrivals on `app.espaluz.lat`, 30 days, from `espaluz-lat` and Facebook | 1 and 1 | GA4 |

Reading: publishing was automated and views were visible, but no one joined a film to a click to a person. The numbers above do
not prove which film caused which visit. Payments from films: not traced here.

## Where film 01 can and cannot be measured today
| Channel | Link | Can we separate it? |
|---|---|---|
| Facebook | `app.espaluz.lat/?utm_source=video` (this post only) | Yes, for the app link |
| Facebook | `wa.me`, `t.me` with no tag | No |
| Instagram | Caption link not tappable; bio link | No: not tagged per film |
| YouTube Short | Description link not tappable; channel link | No: not tagged per film |
| Typed `espaluz.lat` | Forward tags all as `espaluz-lat` | No |

Platforms give counts of viewers, never names. A person becomes known only when they click and write.

## Plan
1. Every future caption: app link `utm_source=<channel>&utm_campaign=<film>`, Telegram `?start=<film>_<channel>` (the bot already
   reads a start argument), WhatsApp pre-filled first message naming the film.
2. Bio and channel links tagged per channel, one fixed link per profile.
3. Replace the old `lovable.app` address in `VIDEO_LINKS` (`EspaLuz_Influencer/main.py:1468`). Film 01 was corrected by hand.
4. One scoreboard per film, at 48 h and weekly, to Telegram: views by channel → app arrivals → first chat → 20-message wall →
   sign-up → first lesson → paid. Read with `scripts/promo-attribution-read.mjs`. Exclude internal accounts.
5. Decision rule (proposed): a film with views and no arrivals changes the door, not the film.

## Also found
YouTube Studio shows a Community Guidelines warning on this channel, with an optional training. Not touched. The channel still
mixes EspaLuz, AI Growth Operator and book trailers.
