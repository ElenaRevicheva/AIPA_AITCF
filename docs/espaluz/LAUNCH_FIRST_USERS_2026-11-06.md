# EspaLuz: first users, with no money. Proof first, then the message (6 Nov 2026)

Elena, 6 Nov: forget beating Replika, Duolingo or Buddy today. Gain users, in the right places, without money. First
prove from production what is true, then say who we are, what pain we solve, and what makes people stay and pay.

**This replaces the order in `SEO_GEO_PLAN_BETTER_THAN_REPLIKA_DUOLINGO_2026-11-06.md`.** That plan fixed the old
`/espaluz` page first. The refreshed product lives on `app.espaluz.lat`, so the door has to move there instead.

**Status: nothing below is fixed yet.** All numbers read today, counts only, no message text read.

---

## 1. What production proves

| Question | Answer | Source |
|---|---|---|
| Real people, ever | **40** (17 internal excluded) | `espaluz-truth.json`, 6 Nov 10:53 UTC |
| Paid, ever | **0** of 40. Trials: 37 ever, 0 active | same, checked against PayPal and PágueloFácil |
| Active in the last 30 days | **0**. Newest stranger arrived in Sept | same |
| Left the same day they arrived | **35 of 38** with dates | same |
| Sent 2 messages or fewer | **32 of 40**. Most by anyone: 10 | same |
| Came through | WhatsApp 34, Telegram 3, web 3 | same |
| Country, by phone prefix | Panama **13** is the only cluster; Argentina 5, Colombia 3, rest scattered | same |
| Web accounts created, 14 days | 1 (internal, 30 Oct, never confirmed). Strangers: **0** | Supabase `auth.users` |
| Web activity, 14 days | **One account.** 339 classroom turns on **8 of 14 days**; adult web chat 1 row | `learning_sessions` |
| Visits, last 7 days | 81 visits → 3 door clicks (all web) → 0 signups → 0 payments | GA4 funnel dry run |
| Conversion by source | `espaluz.lat` 61 visits → 1 click; **Google 3 visits → 2 clicks** (tiny sample) | same |
| Parent reports in the log | **47**; daily ritual 5; weekly recap 2 | Telegram log, WhatsApp journal |
| Grown-up fact memory, RAG, follow-ups (14 days) | **0** `remembered`, **0** `RAG recalled`, **0** `followup sent` | Telegram log, WhatsApp journal |

**Plain reading.** The kids classroom holds one family day after day. Everywhere else, strangers came for one or two
messages and left. Logs show the product works; they do **not** show that strangers want it. That is the question the
launch has to answer. There is too little stranger conversation to read a pain from: stored chat history is 9 sessions,
none matched to a counted stranger. So the pain below comes from the founder's life plus public forums, not from logs.

**Built in two weeks (commits on `main`, 23 Oct-6 Nov):** ascent 143, Familybot 54, WhatsApp 37, Influencer 7, aideazz
75. The output is real. No new person has used it yet.

## 2. Blockers: a launch today would leak here

1. 🔴 **A stranger cannot finish web sign-up.** Confirm-email is ON (`mailer_autoconfirm:false`) and custom SMTP is OFF
   (dashboard, read today). Supabase's built-in mail "will refuse to deliver messages to addresses that are not part of
   the project's team", at 2 messages an hour. So the free 20 messages end at a sign-up whose email never arrives, and
   password reset fails the same way. Delivery was inferred from docs + settings, not tested with a stranger's address.
   **Fix:** custom SMTP with the Resend account already in use. Elena pastes the key herself. Then one real test sign-up.
2. 🔴 **We are blind inside the app.** `app.espaluz.lat` has no analytics at all. Visitors, first messages, the sign-up
   wall: nothing is counted, and anonymous trials save nothing. **Fix:** GA4 tag (same property) + events: chat started,
   20-message wall reached, sign-up, first kid lesson.
3. 🟠 **The address on every video skips the refreshed landing.** `app.espaluz.lat` in Lovable is correct and stays. Only the short address `espaluz.lat` (a GoDaddy forward) is in question. `espaluz.lat` forwards to `aideazz.xyz/espaluz`, which still
   sells doctor and offices, and its web button uses the old `lovable.app` address. 61 of 81 visits came this way.
   **Fix:** forward `espaluz.lat` to `app.espaluz.lat`. Country pages stay as the Google and AI-answer layer, and link in.
4. 🟠 **"Remembers you" has no real proof.** 0 fact or RAG lines in 14 days despite the founder's own use. Only the
   3 Nov probe passed. A WhatsApp bug was noted 5 Nov (redundant `import threading`) and the fix is still listed as
   proposed. A companion that forgets loses the whole pitch. **Fix:** check, fix, prove with a log line.
5. 🟡 Influencer: 182 tracebacks in 14 days, mostly Telegram 502s, 17 in the last 3 days. Check posts still go out.

## 3. Who we are (draft for Elena to rewrite)

The market is flooded with AI tutors (lessons) and AI companions (one person's feelings). **The niche neither covers:**

> **Families raising children in a Spanish-speaking country.** The child's school runs in Spanish, the parents work, and
> nobody at home has time to teach. It is a long road, not a course.

**What EspaLuz is:**

> EspaLuz is a bilingual AI companion for families building a life in a Spanish-speaking country. Pere and Titi keep your
> child learning, ten minutes a day, in Spanish and English, and you see what they learned. EspaLuz stays with you too,
> on WhatsApp, Telegram and the web, for as long as the road takes. Built by a mother living this in Panama.

**Who:** working parents, ordinary family budget, child around 6-8 (the class path's age), Panama first because that is
the only place we have any cluster and the deepest content.

**Why they need it, when ChatGPT is free:**
- ChatGPT answers when asked. It does not run a ten-minute class for a six-year-old and report to the parent.
- Duolingo teaches one person a course. It does not know your child's school week or your country's words.
- Replika cares for one adult's feelings. It is not for children and not about your new country.

**Do not lead with:** translation, photo help, doctor or office help (her 5 Nov call), "one memory" for grown-ups (not
built, see the SEO plan), any user numbers or testimonials (there are none).

**Evidence for the pain (public, anecdotal):** parents on [talesmag](https://talesmag.com/real-school-report-city-question-answers/252/42)
and [expat.com](https://www.expat.com/en/forum/south-america/ecuador/cuenca/618388-schools-for-kids.html) describe tutors
on top of Spanish classes, lonely children and the wish for one Spanish-speaking parent. Enough to test, not proof.

## 4. What makes them stay and pay

**Stay: a pain that comes back every school day.** The only returning use we have measured is the kids' lesson, and
one-off needs (a doctor, a form) end and people leave.

Loop: child's lesson → parent report → tomorrow's lesson. All of it exists. Unproven with strangers.

**Pay: at the moment the parent sees value**, not when a counter runs out. Aim for this order:
1. Parent tries it with the child, with no sign-up.
2. The parent sees what the child practised (the report).
3. Sign-up keeps the child's progress, which is the real reason to register.
4. Day 14: $11 to continue, or $120 for the year.

**Weekly scoreboard:** visits → chat started → first kid lesson → day-2 return → week-2 return → paid.
**Pass mark for the test (a proposed goal, not a forecast):** 10 families complete a first lesson; 3 come back in week 2;
1 pays. If families do not return, the pain or the audience is wrong, and we find out for $0 before building more.

## 5. Where the people are, for $0

| # | Place | Why | Who does what | Evidence |
|---|---|---|---|---|
| 1 | **Families Elena knows in Panama** (school gate, friends, parents' chats) | Fastest way to 10 real tests. She can watch them use it | She sends one personal message; I draft | Panama is our one cluster. The rest is judgement |
| 2 | **YouTube Shorts + Reels**: each answers one family question | Reaches people with no followers; machine exists | I build a daily queue from 27 unused clips and 10 ready captions, through Make 6869112. She approves 3 samples | Perplexity cited YouTube for "moving to Panama with kids" (4 Nov) |
| 3 | **Google and AI answers**: school questions on our pages | Best intent we have seen; slow | I build; no model writes the text | Google 3 → 2 clicks. Cited 0 of 9 on 4 Nov |
| 4 | **Pinterest**: country pages and clips | Search-driven, long-lived | She clicks OAuth once; I wire it | Judgement, from the 3 Nov audit |
| 5 | **Parent forums and Facebook groups**: expat.com, Panama and worldschool groups | The people are there. No API, and a bot risks her Page | I find live threads and draft honest answers; she posts two a week, saying she is the founder, under each group's rules | Group names not verified yet: today's search found none for Panama |
| 6 | **Worldschool hubs and cohorts** (Mexico, Costa Rica, Colombia) | Families together, with partner codes that work (`/org`) | After the first 10 | Commercial blogs only; outreach dropped 4 Nov, so last |

**Not now:** paid ads, Product Hunt or any big launch before section 2 is closed. A launch sends its one spike of
visitors into a broken sign-up.

## 6. Order

1. **Elena, 5 minutes:** Supabase → Authentication → Emails → SMTP Settings → Enable custom SMTP, Resend key. One test.
2. **Me:** GA4 + events in the app; forward `espaluz.lat` (with her go); memory proof and fix. One Lovable Publish.
3. **Elena + me:** rewrite the first screen in her words from section 3.
4. **Elena:** message the first families. **Me:** read every result from logs each day.
5. **Me:** daily Shorts after she approves samples; Pinterest; forum drafts.
6. Monday: scoreboard. Decide from it.
