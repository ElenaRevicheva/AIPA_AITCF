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
| G1 | The film's END CARD shows plain doors (app.espaluz.lat, @espaluz · +507 6662 3757 since v14, @EspaLuzFamily_bot); video pixels are never tappable on any platform | a viewer who TYPES what they saw arrives untagged - the most common path for video |
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

## Profile links (G2) - checked live 21 Nov, proposals WAIT for Elena's OK per change
Code for profile links (not a film): `f20261121b10b` ("b10b" = bio) - matches the bots' FILM_RE, so arrivals become
`promo_arrival` + HubSpot deal like any film. `-ig` = Instagram bio, `-yt` = YouTube channel.
- **WhatsApp @espaluz = the bot: VERIFIED** (Elena's phone: username search -> "EspaLuz AI Family Tutor", +507 6662-3757).
  Note: the WA Business description still says "expats and digital nomads ... Learn Spanish" (old order; families first now).
- **YouTube @AIdeazz** channel links: 1) EspaLuz `app.espaluz.lat/?utm_source=youtube&utm_medium=channel_link` (tagged, shown under
  the channel name) 2) AI Ops Runbook. MISSING: WhatsApp + Telegram. Proposal: add
  `https://wa.me/50766623757?text=Hola%20EspaLuz%21%20%28f20261121b10b-yt%29` and `https://t.me/EspaLuzFamily_bot?start=f20261121b10b-yt`.
- **Instagram @elena_revicheva** (personal/career account, 5 of 5 bio links used): 1) WhatsApp `wa.me/50766623757` UNTAGGED
  (arrivals from IG are invisible) 2) app `?utm_source=instagram&utm_medium=bio` (tagged) 3) sop-ai-ops 4) Atlas 5) /api audit.
  Proposal: link 1 URL -> `https://wa.me/50766623757?text=Hola%20EspaLuz%21%20%28f20261121b10b-ig%29` (same title). No room for
  Telegram unless one AIdeazz link goes. Bio TEXT stays (career profile - job search uses it).
Checked: both proposed links open the right bot (og:title), and the code matches FILM_RE.

## Last automated EspaLuz posts (checked live 21 Nov in Elena's Chrome)
Automated = Influencer bot -> Make 6869112 -> Facebook Page + YouTube Short + Instagram Reel. FB groups / Reddit stay manual.
- **6 Nov film "Su escuela es en español"** (newest): YouTube Short `L-MYvQZYyG0` = 1 view; Instagram Reel (6 Nov) = 0 comments.
  Text under both: "Tap the channel name above / Link in bio, or type espaluz.lat" - **zero URLs**.
- **2 Nov film "Your new country, in Spanish"**: YouTube Short `RPGI_lhfqFU` = 1,233 views; description PRINTED the URLs
  (old lovable.app web link, plain wa.me, plain t.me - untagged).
- Facebook Page: not readable (Chrome is not signed in to Facebook; Claude does not sign in). The bot's code adds 4 tappable
  tagged links there (web utm, WhatsApp with film code, Telegram start code, ANDROID wa.me link).
**Finding:** on 2 Nov we removed the URLs from YouTube because they are not tappable in the phone Shorts player. But YouTube
links in a description ARE clickable on a computer and TV (the watch page). So the 6 Nov post lost every tappable link for
desktop viewers. Proposal: YouTube description = the same tagged links as Facebook (film code + `-yt`) PLUS the
"on a phone, tap the channel name" hint. Instagram: captions never link -> the bio links carry it (tag the WhatsApp link).
