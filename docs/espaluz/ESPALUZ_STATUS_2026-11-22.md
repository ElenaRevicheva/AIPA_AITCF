# EspaLuz - where it really stands (22 Nov 2026, 11:45 UTC)

Checked live today: Oracle services, the bots' shared Postgres (`event_log`, `truth_people`), Supabase auth +
`play_testers`, and a dry run of the 13:40 film report. No number below is from memory.

## 1. The product (built, live)
| Layer | State |
|---|---|
| Doors | web `app.espaluz.lat` · WhatsApp @espaluz · Telegram · Android closed beta (Google Play) - all four running |
| One family memory | same family notebook on web / WA / TG |
| Modes | family companion (bilingual, 21 countries' local ways) · school-letter photo help · voice translation · Pere & Titi kids classroom (+ Мишка & Лиса RU) · Pro English (work scenes, pronunciation score, explains itself + how to exit since 21 Nov) · Settle mode |
| Money | PayPal / PagueloFácil on web and bots, one payment truth; Play Billing for the Android app |
| Services on Oracle | espaluz-familybot, espaluz-whatsapp, espaluz-influencer, espaluz-payments-webhook: all active |

## 2. The people (truth layer, hourly)
- 49 real people ever · 37 trials ever · **0 active trials · 0 paid ever** · 12 alive in the last 30 days.
- Web: 14 accounts; 5 since 6 Nov, all 5 confirmed their email (the 6 Nov "strangers can't confirm" fear did not show up in the data).
- Android beta: **6 testers active, Google needs 12** opted in for 14 straight days before the app can go public.

## 3. The campaign (film 02, v18)
- EN v18 posted 21 Nov: YouTube Short **112 views in ~16 h**, IG Reel + FB Page live, all links tagged.
- Last 7 days, film visits to the app: ~45 (espaluz-lat 22, video 8, youtube 5, instagram 3+3, FB v18 code 1).
- **Every visit -> 0 chat, 0 sign-up.** Bot arrivals from a film: only our own tests. needs_human: only our own test.
- **CORRECTION (GA4 probe, same day): those "film visits" are mostly NOT people.** Nearly all are US desktop sessions with
  0 seconds engaged and 100% bounce - the signature of link-preview crawlers (Facebook / Instagram / YouTube fetch a link
  when it is posted). Real human film visits in 7 days: a handful (sessions with 20-30 s engaged), none started a chat.
  Some links also carry broken tags: `{source}`, `PLACEHOLDER`, `video\n` (an unfilled template / a trailing newline).
  So the leak is **watch -> tap**, not **land -> leave**: almost nobody who watches the film comes to the app at all.
  30-day app events (all traffic): chat started 4, sign-up sent 3, classroom opened 20 - the app does work when people arrive.
- ES v18 due today (22 Nov, Elena forwards), RU tomorrow. Influencer nightly 23:00: true posts on EspaLuz nights.

## 4. Automation that runs without Elena
Tagged links -> arrival catch -> HubSpot deal · greeting + one nudge 18-23 h · needs-a-human alert (only those) ·
web sign-up -> WEB deal · 13:40 UTC one report (films + people) · hourly truth layer · nightly DB backup.

## 5. Open, in money order
1. **The leak is watch -> tap (see the correction in 3).** Viewers on a phone inside YouTube / Instagram rarely leave the app
   for a link. Next: find which post writes `{source}` / `PLACEHOLDER` / `video\n` and fix it; make the report count only
   engaged sessions so crawlers stop looking like visitors.
2. **6 more Android testers** -> Play production -> a store listing (a demand channel). Karen (Mon) and Michael's circle are the warm path.
3. Supabase egress over the free quota (grace to 4 Dec, noted 6 Nov) - **not re-checked today**; must be checked before 4 Dec or the app can stop.
4. Report polish: test arrivals (`eeee`) still print in the "bot arrivals" line; a source with a leading space splits a row in two.
5. Elena's open decisions: truth layer keeps first_film · family questions in the citation probe · Atlas `expat_language` ·
   blog family lane · scheduled ES/RU film queue · 10 [ESPALUZ-ORG] pilots.
