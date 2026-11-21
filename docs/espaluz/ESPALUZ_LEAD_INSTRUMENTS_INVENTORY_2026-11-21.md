# EspaLuz promotion: what the lab already has for tracking and lead handling (21 Nov 2026)

Elena, 21 Nov: "before building, dig what we already have, connect the pieces, do not reinvent the bicycle."
Checked live today (Oracle crontab, Make blueprints, HubSpot, code). Builds on `COFOUNDERS_WEAPONS_FOR_ESPALUZ_2026-11-06.md`.

## 1. Inventory (state checked 21 Nov)
| Instrument | Where | What it does for EspaLuz today |
|---|---|---|
| Truth layer `truth_people` | cto-aipa `scripts/espaluz-truth-sync.py`, hourly :53 | One verified row per real person across WA/TG/web/PayPal/PagueloFácil. Reads web accounts (Supabase admin). **Does not store the film that brought them.** |
| Film report | `scripts/espaluz-funnel-weekly.mjs --films`, daily 13:40 UTC -> Telegram | Per film: GA4 visits -> chat -> sign-up -> class -> doors; bot arrivals (counts) |
| Bot arrival catch | both bots `espaluz_catch.py` + `espaluz_talking.note_promo_arrival` | Film-coded WA/TG first message -> `promo_arrival` event + HubSpot `[ESPALUZ] WA/TG` deal (existing deal gets a film note since 21 Nov) |
| Android door | `espaluz_catch.android` | Self-serve: Google group `espaluz-testers` + opt-in + Gmail -> `play_testers` free to 31 Dec. No manual step for Elena |
| WA proactive pass | `espaluz_bridge.py` 10-min loop + `espaluz_wa_growth.py` | Payment reminders, life-event follow-ups, weekly recap, morning line - all inside the 24 h window. **No newcomer nudge before 21 Nov** |
| Influencer bot | `EspaLuz_Influencer` | Video publisher (Make 6869112 -> FB/YT/IG, tagged links per platform), daily 23:00 promo to the Telegram channel, `/stats /weekly /strategy`. Each daily promo writes an `[ESPALUZ] Influencer post` deal (most of the 111 `[ESPALUZ]` deals) |
| Lead Concierge | Make 5633833 / 5953877 -> cto-aipa `/concierge/draft` (`src/concierge.ts`) + watchdog + self-test | Website inquiry forms only (filter: message contains `AIDEAZZ-FORM`) -> Fable draft -> Telegram card with Send button. **Never fires for EspaLuz** (checked) |
| Chat concierge | `src/chat-concierge.ts` | HubSpot live chat on aideazz.xyz -> Telegram. EspaLuz web chat is OFF (`HUBSPOT_CHAT_ON=false`) |
| Community listener / reply radar / follow-up radar | cto-aipa / VJH | Client + job lanes, not EspaLuz |
| CMO (VJH `linkedin_cmo_v4.py`) | Make -> Buffer -> LinkedIn + IG | EspaLuz is only a link in a list: old door `aideazz.xyz/espaluz`, "19 países", "learn Spanish" positioning. No EspaLuz post type; learning loop open |
| GEO/AEO/Tech SEO | aideazz + cto-aipa | Audit API (app.espaluz.lat 100 A+), sitemap/llms.txt/JSON-LD, blog buyer-question mode (B2B lanes only), citation probe (**family questions not in the weekly run**) |
| Atlas / WHITESPACE | `~/whitespace` | `personal_ai_companions_on_the_go` tracked; **`expat_language` still not tracked** |
| GA4 + PostHog | app.espaluz.lat | GA4 counts film sessions by utm; PostHog (project 740401) replays `/` and `/auth` after cookie Accept |
| HubSpot | portal 51409153 | 111 `[ESPALUZ]` deals (Influencer posts, trials, one intro deal). MCP lacks `crm.hubsql.execute` (no SQL counts) |

## 2. Today's build vs the inventory (honest)
| Built 21 Nov | Overlap found | Decision |
|---|---|---|
| Newcomer nudge (both bots) | None - WA growth pass has no first-contact nudge | Keep; lives inside the existing 10-min WA loop |
| needs_human detector + 5-min watcher alert | None - no bot alerts Elena; Concierge is form/email only | Keep; reuses CONCIERGE_TG_CHAT + the CTO bot like every other alert |
| Web sign-up -> `[ESPALUZ] WEB` deal | Reads Supabase auth a SECOND time (truth sync already does hourly) | Next: truth sync stores `first_film`; watcher reads `truth_people` |
| Daily people digest 13:45 | **Duplicate**: a third EspaLuz/ops message beside the 13:40 film report (and 13:45 apply-kit audit) | **Merged into the 13:40 film report (one message); 13:45 cron removed** |

## 3. Existing weapons not yet pointed at the EspaLuz promo (no new code)
1. Citation probe: add the 3 family questions to the Monday run.
2. Atlas: add `expat_language` to `tracked-verticals.json`.
3. CMO: EspaLuz lane with the live facts (21 countries, adaptation slogan, app.espaluz.lat), close the GA4 learning loop.
4. Blog buyer-question mode: one family lane with the door to app.espaluz.lat.
5. Influencer daily-promo deals: stop writing one HubSpot deal per post (they bury real families in the stream).
Each needs Elena's go (they touch her public channels or the B2B blog).

## 4. In plain words for Elena (21 Nov): what runs by itself, what reaches her
Her role: read ONE daily report, approve or refuse proposals. Everything else is automatic.
- **Promotion (automatic):** Influencer bot posts a forwarded film to FB Page + YouTube Short + IG Reel with tagged links; daily 23:00 Telegram channel promo; CMO daily LinkedIn/IG post (EspaLuz part outdated - needs her go); YouTube channel + IG bio links tagged.
- **Tracking (automatic):** film code in every link -> bot arrival -> HubSpot deal (film, platform, first message); GA4 film visits + PostHog; web sign-ups keep the film -> HubSpot WEB deal; truth layer hourly (every real person, trial/paid); 13:40 UTC report (films + people).
- **Outreach (automatic):** bots answer 24/7 in the person's language with family memory; one nudge to a quiet arrival (18-23 h); trial-end reminders, life-event follow-ups, weekly recap, morning line; Android tester enrollment self-serve.
- **Reaches Elena:** the 13:40 UTC report, and instantly ONLY a person who needs a human (price / premium / a real person / a complaint).
- **Still manual today:** forwarding each film to the Influencer bot (can become a scheduled queue); her personal reply to "needs human" people.
