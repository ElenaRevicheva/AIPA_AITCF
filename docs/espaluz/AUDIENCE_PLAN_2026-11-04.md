# EspaLuz — reaching the right families with what we already have (4 Nov 2026)

Constraint (Elena): no ad money, no time to sit in groups, no new engines. Reuse and connect.

## What was measured today
**1. Where families ask: AI answers.** `citation-probe.cjs` (existing, Oracle) asked 3 family questions
("moving to Panama with kids, Spanish-speaking school…", "help my child learn Spanish fast after moving to
Latin America", "best app for an expat family to learn Spanish together in Panama"):
- 12 attempts, 9 measured, **EspaLuz / aideazz.xyz cited 0 of 9**.
- ChatGPT (openai-search) cited: english-to-spanish.org, sonrisasspanishschool.com, colorincolorado.org, open.edu,
  colombiamove.com, busuu.com, myspanishtravels.com, speakbetterspanish.com, insidepanama.com …
- Perplexity cited: relofirm.com, panamaequity.com, jarniascyril.com, riotimesonline.com, startabroad.com,
  mylatinlife.com, prolangschool.com, italki.com, preply.com, parrotapp.com …
- Mostly **small niche blogs and relocation firms**, not giants. Being cited there is free and permanent.
- Google AI Overview returned no sources; **Gemini grounded: HTTP 402 "prepayment credits are depleted"** — the
  Monday probe is running one engine short.

**2. Reddit:** the threads exist but are rare (a 2024 r/ExpatFIRE thread, a few on r/expat). The existing
`community-listen` (cron `25 * * * *`, drafts only) found **0** with family queries: Bright Data search returned 0
and its topic gate admits only AI-business threads. Low yield — not the first move.

**3. The page:** 57 visits/7 days → 0 door clicks (GA4). Every channel lands here.

**4. Facebook groups:** no API since Apr 2024; a bot on her profile risks the Page + Make scenarios.

## What we already own that fits
| Piece (exists, live) | Use for families |
|---|---|
| `citation-probe.cjs` Monday cron | add the 3 family questions → weekly "is EspaLuz cited yet?" line |
| EspaLuz page + 21 country pages (`build-espaluz-countries.py`, claims table) | answer the exact family questions in plain FAQ, from true-today facts only |
| Daily blog, buyer-question mode (`DAILY_BLOG_BUYER_QUESTIONS`) | could take family questions — but it is the AIdeazz B2B blog; Elena decides |
| Outreach sender (Resend + HubSpot notes) | one letter to each site the engines already cite (relocation firms, expat blogs): free family pass for their readers / be listed |
| Make 6868765 + 6869112 (FB Page, Reels, Shorts) | keep; add `utm_source` per channel so the Monday funnel line separates them |
| `espaluz-funnel-weekly.mjs` Monday | the scoreboard: visits → doors per source |

## Elena, 4 Nov: drop outreach — the record agrees
Outreach needs a stranger to say yes. Measured history: 117 manual client prospects → 1 reply (0.85%); 10
EspaLuz chamber/school pilots (Aug) → no pilot; dental clinics silent. So step 4 below is **dropped**. Only windows
that need **nobody's permission** remain:
1. **The 57 visitors a week who already arrive** (0 door clicks) — fastest, measurable in 7 days.
2. **AI answers via our own pages** — competitors cited are small blogs; slow (aideazz.xyz was cited 1 in 22
   answers on 28 Oct after months of daily posts), measured weekly by the probe.
3. **YouTube via the existing Make Shorts scenario 6869112** — Perplexity cited youtube.com for the
   "moving to Panama with kids" question; titling Shorts as the family's own question needs no one's OK.

## The order (each step proven by its output line)
1. **Page first screen** — one "Start free on WhatsApp" button + who it is for. Proof: door clicks > 0 in GA4.
2. **Measure the target** — family questions into the Monday citation probe. Proof: Telegram line with 0/N baseline.
3. **Answer the questions where engines read** — FAQ blocks on the EspaLuz page/country pages. Proof: probe cites.
4. ~~Get onto the pages engines already cite~~ (dropped, see above) — letters to relofirm, panamaequity, insidepanama, jarniascyril,
   myspanishtravels … drafted into HubSpot, Elena approves each send.
5. Only then: ChatGPT ads $100 total-budget test (see `CHATGPT_ADS_DECISION_2026-11-04.md`).
