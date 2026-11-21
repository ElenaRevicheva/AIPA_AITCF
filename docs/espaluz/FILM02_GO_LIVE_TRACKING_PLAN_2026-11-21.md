# Film 02 (v13) go-live with click-by-click tracking - plan (21 Nov 2026)

Elena: "make these videos live, with detailed, careful tracking of each click, any channel - where viewers come from, how to
reach them, what to do - so it does not happen like with my YouTube AI Growth Operator videos."
Builds on (does NOT rebuild): `PROMO_TRACKING_AUDIT_2026-11-20.md` (catch built + proven 20 Nov), `FILM02_LINKS_2026-11-20.md`
(film codes), the daily 13:40 film report (`scripts/espaluz-funnel-weekly.mjs --films`, Oracle cron).

## Where we stand (measured today, Oracle film report)
- Older films: YouTube 1.2 thousand views on one; app arrivals from films 22 visits -> 0 chats -> 0 sign-ups.
- Bot arrivals from films, all time: **0**. Facebook / Instagram views: not read by anything.
- Already LIVE (20 Nov): coded WhatsApp/Telegram links -> `promo_arrival` + HubSpot deal `[ESPALUZ] WA/TG ... — trial` with film +
  platform + group + first message; FB-group codes `-g1..`; ANDROID door -> Gmail -> play_testers; web keeps the first campaign
  tag 90 days and saves it on the account at sign-up (`first_touch`).

## The gaps (why views could again turn into nothing)
| # | Gap | Effect |
|---|---|---|
| G1 | The film's END CARD shows plain doors (app.espaluz.lat, @espaluz, @EspaLuzFamily_bot) | a viewer who TYPES what they saw arrives untagged - the most common path for video |
| G2 | Instagram captions and YouTube Shorts descriptions are not tappable | coded links there are dead unless in the IG bio / YT channel links / pinned YT comment |
| G3 | No real tap has ever been proven per door | we do not KNOW the chain works end to end from a phone |
| G4 | Arrivals are counts in a daily report; no per-person alert | Elena cannot act within WhatsApp's 24 h window |
| G5 | A web sign-up from a film keeps `first_touch` but becomes no HubSpot deal | web people are invisible in the CRM; only bots create deals |
| G6 | Facebook / Instagram views are not read | no "views -> clicks" rate for those platforms |
| G7 | Russian films get no ANDROID line in the post footer | RU viewers have no tester door |
| G8 | Brand pages a visitor lands on were stale (6 Nov: FB cover with dead Gumroad link, IG = personal career bio) | trust lost at the first click |

## The plan (additive, reuse-first, in order)
0. **Go/no-go - Elena, 3 min from her phone:** tap 4 test links (WhatsApp, Telegram, web, ANDROID) with a test code; Claude reads
   the arrival lines + HubSpot deal. Nothing is posted before all 4 are proven.
1. **Typed visits get caught (G1):**
   a. web: a short door `app.espaluz.lat/02` (one route that stores the film tag the same way as utm links, then opens the landing) -
      re-render the end card once (v14) to show `app.espaluz.lat/02` instead of the bare domain;
   b. bots: a NEW number with no code gets ONE question in the welcome: "How did you find us? 1 video 2 friend 3 search 4 other"
      (self-reported attribution) - the answer goes into the same promo_arrival / HubSpot fields.
2. **Per-person alert (G4):** each film arrival (bot or web sign-up) -> one line to Elena's private Telegram: who, which film,
   which platform/group, first message, and the one action to take now. The 13:40 report lists people, not only counts.
3. **Web sign-ups become HubSpot deals (G5):** same `[ESPALUZ]` format as the bots: `[ESPALUZ] WEB <name> — trial`, film + platform
   from `first_touch`, same action note.
4. **Links where they can be tapped (G2):** Influencer footers already carry coded links (Facebook); IG bio + YT channel links +
   a pinned comment per Short - Claude does it in Elena's Chrome with her OK. RU footer gets the ANDROID line (G7).
5. **Brand pages check (G8):** Claude opens FB Page / IG / YT as a stranger and lists what is stale; Elena decides fixes.
6. **Post order:** organic only first - FB Page + 3-5 Facebook groups (one code per group) + IG Reel + YT Short, via the existing
   Influencer bot -> Make path. 48 h of data, then decide. **No paid boost** until steps 0-3 are proven with real people.
7. **What to do with each person (the outreach playbook):**
   - WhatsApp / Telegram arrival: the bot greets at once; if silent ~20 h, ONE follow-up inside the 24 h window (exists since 2 Nov);
     Elena gets the alert and can write personally.
   - Web sign-up: welcome path + HubSpot deal; Elena's alert says "first 3 days: one personal WhatsApp/email".
   - ANDROID: Gmail -> Play testers + play_testers (free to 31 Dec) - Elena adds the Gmail in Play Console (alert tells her).
   - Pro English arrivals: the coach + the support door (WhatsApp business) for premium.
8. **Views (G6):** FB/IG views read from Meta Business Suite by Elena weekly (one number per film) OR via Make if a free module
   exists - checked before building anything.

## Size
Steps 1b, 2, 3: small additions in the bots / functions (no removals), the usual deploy + proof. Step 1a: one web route + one
end-card re-render (no credits). Steps 4-5: Chrome work with Elena's OK. Nothing paid.
