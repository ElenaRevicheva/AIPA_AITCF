# EspaLuz: the Replika SEO/GEO job applied to us, and how we beat them in our niche (6 Nov 2026)

Elena sent Replika's "Technical SEO & GEO Specialist" posting: "this is exactly what we need to do for EspaLuz", and
EspaLuz must be better than Replika and Duolingo in its niche, the middle between a long-road companion for belonging
in a new LATAM country and language tutoring on the go that evolves with the whole family.

**Status: plan. Nothing here is built, deployed or published.** Each batch needs her go. She writes the copy.

**How fresh the evidence is.** Live pages and code: read today. Visits, citations and users: last measured 3-5 Nov,
because today's read of the Oracle logs was blocked by a permission check. Refresh those first
(`espaluz-funnel-weekly.mjs --dry-run`, plus the Monday citation probe line). Competitor prices come mostly from third
parties, and those sources disagree. Re-check against a primary source before anything goes public.

---

## 1. The verdict

The posting is the right job list but the wrong order for us. Replika's goal is 2% more organic revenue a month on top
of 40 million people. Two percent of EspaLuz's stranger revenue is still zero. Replika's job is to compound; ours is to
get the first strangers to pay. So the order is **door → proof → pages → measurement**, and the app stores wait.

We do not beat them as "a better companion" or "a better tutor". We beat them on a job neither is built for: **one
family, years into a new country, helped together.** That claim has one hole, in section 3, and it must be closed before
we say it in public.

## 2. The posting, line by line

| Replika's job | EspaLuz today (evidence) | Our move |
|---|---|---|
| **Technical SEO** | Strong base: `/espaluz` A+ 100, 21 country pages, `app.espaluz.lat` A+ 100 with a static shell. Small errors, read live today: JSON-LD `sameAs` and the Offer URL still point to the old `lovable.app` address; country pages declare `MobileApplication` though no store app exists; `hreflang` en, es and x-default are all the same URL, so they do nothing; `espaluz.lat/robots.txt` and `/panama` return 404 (the domain is a forwarder); three hosts split one brand | Batch 1 cleanup. Domain move stays parked (her decision) |
| **ASO** | No store app. Her 3 Nov decision: "no install, it lives in WhatsApp" is the edge | **Hold**, see section 5 |
| **Listing conversion** (screenshots, video, tests) | The equivalent is the landing page. **57 visits a week → 0 door clicks** (GA4, 4 Nov) | Batch 1: this is the first real test we can run |
| **Passing review** | Not relevant without a store. The strict-category risk still applies: companion + children, section 6 | Check wording and AI disclosure |
| **GEO** | 3 family questions asked on 4 Nov: **cited 0 of 9** measured answers. Cited instead: small blogs and relocation firms (relofirm, panamaequity, colombiamove, italki, busuu...), not giants | Batch 3 pages, Batch 4 measurement |
| **Pages people search for** | Country pages answer "what does this word mean". Nothing answers "my child starts a Spanish school" or compares us with anyone | Batch 3 |
| **Roadmap and reporting** | Monday funnel line and citation probe already run | Add the three numbers in section 7 |

**Message mismatch, the most useful finding today.** Everything sends people to `aideazz.xyz/espaluz`, and that page
still leads with the doctor, the hospital and public offices (its meta description and llms.txt too). She retired that
pitch on 5 Nov: "ChatGPT, Claude serve for this... nobody will pay for that." The page says nothing about one memory or
the long road. So the door may be selling the old product. This is a hypothesis, and the click count will test it.

## 3. Where we can beat them, and what is not yet true

Their own words, from the posting: Replika wants AI that "follows up", "knows the people in your life", and leads to
"conversations that lead somewhere real". That is a promise about one person's relationships.

| What a family needs | Replika | Duolingo | EspaLuz today | Honest status |
|---|---|---|---|---|
| Built for life in a specific LATAM country | Not its aim | Courses, not country life | 21 countries of local words; guides for 20 | ✅ True. Uruguay has words only |
| Children learn too, with the parent informed | Not for children | Has a kids app (ABC); parent reporting not checked | Pere & Titi, parent report after lessons | ✅ Working, so far in the founder's family only |
| Lives in the chats people already use | App | App, web | WhatsApp, Telegram, web, no install | ✅ True. Not unique: Causa and Memrise MemBot are on WhatsApp |
| Memory across the **family**, not one account | One person | Lily memory is tied to the individual account (heise, 2024) | Kids: shared through `learning_sessions` on linked accounts. **Grown-ups: per channel** | ⚠️ **The hole** |
| Follows up on real life | Its stated direction | Streak nudges | Life-event follow-ups wired 2 Nov | ⚠️ Wired, **0 sent as of 3 Nov**: needs a family inside WhatsApp's 24 h window |
| Stays useful for years | Yes | Course ends, streak continues | Companion rules are live | ❌ Unproven: no stranger retention yet |
| Price | Pro ~$19.99/mo or $69.99/yr (third party) | Max ~$29.99/mo; Max Family ~$240/yr (third party) | $11/30 days down to $120/365 days | ✅ Ours is a real offer. Cheaper yearly options exist |

**The hole, in plain words.** The 5 Nov line says WhatsApp, Telegram and web share one memory. Reading the code today:
`espaluz_memory.py` gives a family id of `family_<that channel's id>` unless one is set; `espaluz-chat` (web) reads kids
memory and does not read the grown-up memory tables; on 31 Oct **0 users** were linked across Telegram and WhatsApp; the
1 Nov plan says grown-up memory across channels "is not in Phases 0-3". Code reading is not a production test, so prove
it with a probe. If it holds, a parent who tells WhatsApp something will not be remembered on the web.

**It matters because this is the one thing neither giant can claim, and `I do not want to scam anybody` is a hard
constraint.** Until it is closed, public wording stays with what is true: the same EspaLuz on every channel, and one
memory for the child's learning.

**The category line.** Today's web searches found kids apps and adult tutors, and no product joining family, companion
and life in LATAM. That is a sign the space is open, not proof it is empty.

## 4. Words: her brand, their questions

Nobody types "long-road companion". Keep her line as the **brand**, and use the family's own words for **page headings**:

- Brand (hers, unchanged): "live your new country in Spanish", "a bilingual long-road companion in all your chats".
- Headings (buyers' words, already listed in `AUDIENCE_PLAN_2026-11-04.md`): "My child starts a Spanish-speaking school
  next month. How do they keep up?", "Moving to Panama with kids: how will they learn Spanish?"
- Golden middle stays: no "survival", no "premium", never "fluent in no time".
- Leaving "AI" out of the Google description is fine, but the page must say plainly that EspaLuz is an AI (section 6).

## 5. App stores: not now

The posting says most new mobile users come from a store search, so holding back gives up a real channel. Holding is
still the better call today, because a store app would first force these changes:

- **Payments.** Apple 3.1.1: unlocking features or subscriptions in an app "must use in-app purchase". PayPal and
  PágueloFácil would not unlock inside the iOS app unless an exception applies (check regional rules).
- **A wrapped website is at risk.** Apple 4.2 wants an app to be more than "a repackaged website".
- **Children.** Apple 1.3's Kids Category bars third-party analytics and sending identifying data to third parties. Our
  classroom sends audio and text to outside AI services, so that needs real review before any listing.
- Only Apple's guidelines were read today. Google Play's policy must be read before any decision on it.

**Reopen when:** 10 strangers have paid. Then a store listing has a real conversion rate to learn from.

## 6. Risk the posting hints at ("our category gets close scrutiny")

"AI companion" plus children is a watched combination. California SB 243 has been in force since 1 Jan 2026 (clear AI
notice, safeguards for minors, self-harm protocols). The FTC sent study orders to seven companion-chatbot companies in
Sept 2025. Secondary sources report more state laws in 2026. Not legal advice, and not all of it may reach us, but it
shapes three choices:

1. Say clearly, on page and in chat, that EspaLuz is an AI.
2. Keep "companion" for the grown-up side. The children's side is a **classroom** with teachers Pere & Titi.
3. Check what the grown-up and kids rules do with a self-harm message. Not reviewed today.

## 7. The work, in order

**Batch 1: the door (small, this week).** All on the page every channel already sends people to.
- I draft 2-3 new openings for `/espaluz` and its description to match the 5 Nov positioning, without overclaiming
  memory. **She picks or rewrites.** Only that block changes ("edit, not eat").
- Mechanical fixes: `sameAs` and Offer URL → `app.espaluz.lat`; drop `MobileApplication`; matching text in `llms.txt`.
- Success: door clicks above 0 per week, on GA4 events that already exist.

**Batch 2: the proof.**
- Run a cross-channel probe with a test family (create, talk, recall, delete) to confirm the hole.
- Plan the smallest link using what exists (`connected_bots`, `family_id`), with no second store. Confirm before building.
- Watch for the first real `followup sent` log line.

**Batch 3: the pages (her go on each list).** Use the same deterministic builder as the country pages, with no model
writing and only true-today claims.
- 6 question pages from the family questions above.
- 2 comparison pages: **"Duolingo vs EspaLuz for families living in Latin America"** and **"Looking for a Replika
  alternative as a parent abroad?"**. Say what they do better, too. Dated prices, primary sources only. That honesty is
  also what gets a comparison cited.

**Batch 4: measurement, and proof for her career.**
- Add 3 comparison questions to the Monday probe; record *how* we are described as well as whether we are cited.
- Scoreboard on the existing Monday line: **door clicks / visits · cited out of N answers · paying strangers.**
- The 0 of 9 baseline is the "before" the posting asks for. Any real "after" becomes her verifiable GEO case.

**Not doing (from her earlier decisions):** outreach to cited sites (dropped 4 Nov: 117 prospects → 1 reply), buying
ads, leagues or XP, a store app. The posting asks for work on third-party lists and threads; for now that is limited to
listings needing nobody's permission, such as YouTube Shorts through the Make scenario (10 caption lines are ready) and
directory entries she can submit herself.

**Targets (proposed goals, not forecasts):** door clicks above 0 within 7 days of Batch 1; cited at least once within 3
months of Batch 3; first 10 paying strangers as the gate for everything larger.

## Sources

Replika posting: pasted by Elena, 6 Nov 2026. Internal: `LOCAL_LIFE_POSITIONING_2026-11-02.md`,
`STATE_2026-11-03.md`, `AUDIENCE_PLAN_2026-11-04.md`, `ONE_FAMILY_MEMORY_PLAN_2026-10-31.md`,
`MARKET_SCAN_ADULTS_FAMILIES_2026-11-03.md`, `HEALTH_CHECK_2026-11-05.md`.

External: [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) ·
[Replika pricing, third party](https://aicompanionpick.com/replika-pricing-2026) ·
[Duolingo Max family price, third party](https://duolingoguides.com/duolingo-max-family-plan-price/) ·
[Lily's memory, heise](https://heise.de/-9951940) ·
[italki AI Spanish app roundup](https://www.italki.com/en/blog/best-ai-spanish-learning-app) ·
[SB 243 summary](https://www.mondaq.com/unitedstates/new-technology/1692804/ai-regulatory-update-californias-sb-243-mandates-companion-ai-safety-and-accountability) ·
[FTC 6(b) orders, DLA Piper](https://www.dlapiper.com/en-hu/insights/publications/2025/09/ftc-ai-chatbots) ·
[2026 state chatbot laws, secondary](https://www.softwareseni.com/ai-chatbot-regulation-in-2026-pennsylvania-california-washington-and-the-federal-guard-act/)
