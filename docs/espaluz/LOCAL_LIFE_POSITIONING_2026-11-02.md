# EspaLuz: from "AI tutor" to local life in LATAM (2 Nov 2026)

Elena, 2 Nov: *"people are fed up with AI tutors. We pivot into giving the experience of local LATAM life in each of
21 Spanish-speaking countries. Uniqueness without miracles and lies."* Every claim below is backed by code (file
refs from a read-only sweep of EspaLuzWhatsApp + EspaLuzFamilybot, 2 Nov).

## What is true today (may be claimed)
| Claim | Evidence |
|---|---|
| 21 Spanish-speaking countries, each with its own local expressions and meanings | `espaluz_country_contexts_full.py:52` (both bots) |
| Practical life guides for 20 of them: banks for all 20; healthcare, immigration, schools, housing, transport where present | same file, `real_life_scenarios` |
| Deepest for Panama: Migración, CSS, named banks and schools, housing, utilities (8 guides) | same, Panama entry |
| A live voice interpreter for real appointments (pharmacy, doctor, school meeting): speak, hear it back in Spanish/English | Telegram `main.py:5324`, WhatsApp `whatsapp_convo_mode` |
| Photo of a menu, sign, bill or school note, explained | Telegram `main.py:6336`, WA bridge vision |
| Kids learn with Pere 🦥 and Titi 🐒; a parent report after lessons | `/kids`, `kids_lessons.py`, `report_once` |
| Remembers name, country, family and past topics | `espaluz_memory.py:580`, `espaluz_rag.py` |

Measured coverage (2 Nov): Panama 8 guides · Ecuador 5 · Dominican Rep., Guatemala 4 · Mexico, Spain, Costa Rica,
El Salvador, Colombia, Puerto Rico 3 · most others 2 · Chile 1 · Uruguay 0 (expressions only).

## Fixed today so the claim is true on WhatsApp (EspaLuzWhatsApp `10bad69`, live 10:03 UTC)
- Every family got **Panama** help, whatever their country (a profile lookup that never existed). Now its own country.
- "help doctor / school / transport" answered "not available" even for Panama (key mismatch). Now found.

## Do NOT claim (docs only or false)
Proactive follow-ups after a doctor visit (never sent) · spaced-repetition vocabulary (never called) · daily tips
(scheduler not built) · a "relocation journey" stage tracker (not built) · "50+ emotions" (unverified) · any user
count, testimonial or partner (PANAMA_PILOT "200+ users / AmCham / 10 testimonials" is a hypothetical pitch).
Also removed today from the Influencer: "2,000+ people", six invented named customers, 7 days / $7.77.

## The line
**EspaLuz — Spanish for the life you're actually living.** Local expressions for 21 countries, practical guides for
how things work there, a voice interpreter at the doctor or the school, and Pere and Titi for the kids.
14 days free, then $11.

## AEO / GEO / tech-SEO plan (no generation, nothing to hallucinate)
1. **One page per country** `aideazz.xyz/espaluz/<country>` built deterministically from `COUNTRY_CONTEXTS`:
   expressions with meanings (`DefinedTermSet`), the guides that exist (`FAQPage`: "How do I open a bank account in
   Panama as an expat?"), honest "no guide yet" where empty. Each page answers queries answer engines actually get
   ("what does *juega vivo* mean", "Panama slang"), which a generic tutor page can never win.
2. `/espaluz` rewritten around the line above, linking the 21 pages; sitemap + llms.txt; weekly self-audit.
3. Citation probe asks parents' questions (live since `935db96d`).

## Channels: what Make.com and Buffer can really do (read via API, 2 Nov)
- Make (Core, 10k ops/month): 6 scenarios on, all healthy. EspaLuz posts → hook "Emotionally Intelligent Free Organic
  Promo Engine" → Buffer → **Instagram + LinkedIn only**. **No Facebook connection exists in Make or Buffer.**
- Buffer: free plan, 3-channel limit, 4 connected; **TikTok is locked** (cannot post); YouTube works.
- **Facebook Page**: Make has a native Facebook Pages app (post, photo, video; a "reel" action exists, community
  reports mixed results). Needs an EspaLuz Facebook Page + one OAuth click by Elena in Make. **Facebook Groups** (where
  expat parents really are): Meta closed posting to groups by API in 2024, so that stays by hand; drafts can be prepared.
- **Pinterest**: native Make "Create a Pin"; evergreen and parent-heavy, a natural home for the country cards.
- Make's ads modules (Lead Ads, Conversions) manage PAID ads; with $0 budget they reach no one.
- **Video**: X Premium's Grok Imagine is inside the X/Grok app only (manual, already paid). The fleet's xAI API key
  lists `grok-imagine-video-1.5-lite` (third-party pricing ≈ $0.02–0.03/s at 480–720p ≈ $0.30 per 10-s clip) — a
  separate xAI bill, not Premium.
