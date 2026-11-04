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

## Scores, measured 4 Nov (`visibility-self-audit.cjs`)
- **aideazz.xyz/espaluz — A+ 100/100** (839 server-delivered words, full JSON-LD).
- **app.espaluz.lat — C 60/100.** It does NOT inherit the 100: separate domain, JavaScript-only shell (~8 words
  for crawlers), title still "AI Spanish Language Tutor", Lovable OG image + `@lovable_dev`, no JSON-LD, no H1,
  no sitemap. Fine for the app itself; never send AI engines or ads there — the 100/100 page is the door.

## Daily Shorts with Grok Imagine (Elena, 4 Nov) — through the EXISTING lane
Facts: `EspaLuz_Influencer/main.py` `build_video_payload` → Make 6869112 → YouTube Short + FB Reel + IG Reel.
**YouTube title = the first line of the Telegram caption** (cut at 88 chars + `#Shorts`). Each video posts the
moment it is sent; files kept 3 days. YT/IG descriptions say "type espaluz.lat" → GA4 source `espaluz-lat` = the
43 visits last week (videos or Elena's own tests — not separable).
YouTube's July 2025 "inauthentic content" rule targets template-like, little-variation videos (a monetization
rule, not a ban). Safeguard = every Short answers a **different family question** in its first caption line.

**First caption lines (one per Short; each is the question families type):**
1. My child starts a Spanish-speaking school next month. How do they keep up?
2. Moving to Panama with kids: how will they learn Spanish?
3. My kid cries before school because nobody speaks English
4. 10 Spanish words your child needs on the first school day
5. How do I talk to my child's teacher in Spanish?
6. At the public hospital in Panama — what to say in Spanish
7. My child speaks Spanish now. I don't. How do I catch up?
8. Panama school words parents never get explained
9. Spanish for the school gate: pick-up, homework, field trip
10. Can a 6-year-old learn Spanish in one school year?
11. Kids learn Spanish with Pere the sloth and Titi the monkey
12. What to say at the pharmacy in Panama, in Spanish
13. Homework in Spanish and I can't help — what now?
14. Moving to Latin America with kids: the Spanish nobody teaches you

**Gaps (decisions, not engines):** (a) 5–7 sent at once publish as one burst — the audit's queue + one cron line
releasing one video every ~3 h through the same webhook fixes it; (b) YouTube = the AIGO business channel and
Instagram = Elena's personal account — a separate EspaLuz channel/account is her OAuth click in Make;
(c) no claim in a video beyond the claims table ("14 days free" and "AI-generated" lines are already appended).

## The order (each step proven by its output line)
1. **Page first screen** — one "Start free on WhatsApp" button + who it is for. Proof: door clicks > 0 in GA4.
2. **Measure the target** — family questions into the Monday citation probe. Proof: Telegram line with 0/N baseline.
3. **Answer the questions where engines read** — FAQ blocks on the EspaLuz page/country pages. Proof: probe cites.
4. ~~Get onto the pages engines already cite~~ (dropped, see above) — letters to relofirm, panamaequity, insidepanama, jarniascyril,
   myspanishtravels … drafted into HubSpot, Elena approves each send.
5. Only then: ChatGPT ads $100 total-budget test (see `CHATGPT_ADS_DECISION_2026-11-04.md`).
