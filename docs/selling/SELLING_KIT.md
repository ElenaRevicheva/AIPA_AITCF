# AIdeazz SELLING KIT — July 11, 2026

> **The rule this kit lives by:** every hour goes to putting Elena in front of a specific human who can pay. Marketplace-first (buyers already stand there), portfolio as evidence locker, autonomous lead engine as nice-to-have — NOT the channel.
>
> **Grounding:** 2026 market research (July 10) + live HubSpot/logs audit (July 10). AI chatbot dev +71% YoY demand, AI integration +178%, 91% of LATAM conversational-AI runs on WhatsApp, n8n/Make builds close at $1K–6K/workflow, GEO/AEO exploding. Skills confirmed in-demand; packaging below is what was missing.

---

## FUNNEL TRUTH — Aug 1 2026 (read before planning any campaign)

Measured, not estimated. Source: Resend message ids + delivery callbacks, and
`hs-outcomes-to-atlas.cjs` over 99 HubSpot deals.

| Metric | Value |
| --- | --- |
| `[CLIENT-MANUAL]` deals | 96 |
| Emails delivered (all-time, incl. Aug 1 batch) | ~110 |
| **Replies** | **1** (Hospital CIMA) |
| **Reply rate, `geo_aeo` lane** | **1%** (90 sent → 1 replied) |
| Deals won | **0** |
| Bounce rate | ~4% (5 real bounces) · spam complaints **0** |

**What this says:** the machine is not broken — delivery, tracking, stamping and CRM
attribution all work end to end. **The offer/market is the constraint.** Automating
more touches on the same cold list multiplies effort, not income. Before building
anything else, the honest questions are: is the ICP right, is the offer priced and
framed to be answerable, and is cold email the channel that reaches these buyers.

**The one live conversation is worth more than the next 90 cold sends.** Hospital CIMA
replied, routed Elena to Compras, and that letter is delivered and tracked. Work the
reply.

**Top of funnel (new Aug 1):** `scripts/atlas-lead-machine.cjs` stages up to 8 fresh,
audited, deduped leads every Monday as `[CLIENT-ATLAS]` deals at 🔥 I Act TODAY with a
one-click send link. It solves *supply*, not *conversion* — see
`docs/selling/MANUAL_PROSPECT_PLAY.md` for the operational rules and the
double-send warning.

---

## 0. POSITIONING NAMES (canonical, polished July 11 2026)

**Umbrella identity:** **Production AI Builder** — *"I ship AI systems that run real businesses 24/7 — agents, automations, and AI-search visibility. Not demos. Production."*

| Lane | Market name (keyword layer) | Juicy tagline (human layer) |
|---|---|---|
| A | **Conversational AI Agent Builder — WhatsApp & Telegram** | "Agents that sell, support & book — while you sleep. Bilingual EN/ES." |
| B | **AI Automation & Integration Architect — APIs, Workflows, CRM** | "Your tools, wired together with AI. Work that does itself." |
| C | **AI Search Visibility Architect — GEO · AEO · Technical SEO** | "Be the answer ChatGPT gives — cited, not just ranked." |

**Rules:** "Builder" where delivering, "Architect" where designing — never "Engineer" (invites credential checks). "AI-augmented" = method story on calls, never the headline. Marketplaces get keyword titles; LinkedIn/site/humans get the juice lines.

**LinkedIn headline:** `Production AI Builder | Conversational AI Agents (WhatsApp·Telegram) · AI Automation & Integration Architect · AI Search Visibility (GEO/AEO/Tech SEO) | 10 systems live in production | EN·ES·RU`

**One-liner (card/bio):** *"I build AI that works while you sleep — conversational agents, automations, and AI-search visibility. In production, not in decks."*

---

## 1. THE THREE OFFERS

### Offer A — WhatsApp AI Agent for Your Business (flagship, LATAM edge) 🥇
**For:** SMBs & solo founders in LATAM/US-Hispanic markets drowning in WhatsApp messages.
**What they get:**
- AI agent on WhatsApp Business API: answers FAQs, qualifies leads, books appointments — 24/7, bilingual ES/EN
- Pushes every conversation/lead into their CRM (HubSpot or Google Sheets if they have nothing)
- Handoff-to-human rules (complex → owner's phone)
- Task-specific by design (Meta now bans general-purpose AI assistants on the API — compliance built in)
- 2-week delivery · 30-day post-launch support

**Pricing:**
| Channel | Build | Care plan |
|---|---|---|
| Marketplace entry (first 5 clients, reviews) | **$1,500** | $250/mo |
| Direct / after 5 reviews | **$2,500** | $400/mo |

**Proof:** EspaLuz — live WhatsApp AI tutor with paying subscribers, 2-layer memory (pgvector RAG), voice+text, running 15 months on production infra. Demo on request.

---

### Offer B — AI Automation Build (Make/n8n/custom + LLM + your tools) 🥈
**For:** businesses doing manually what software should do (lead routing, content ops, report generation, data enrichment, follow-ups).
**What they get:**
- One automated workflow end-to-end: trigger → AI processing → action in their tools (CRM, email, Slack, Sheets, WhatsApp/Telegram)
- Claude/GPT wired with fallback resilience (my production pattern: Anthropic → Groq → Grok)
- Documentation + loom walkthrough so they own it

**Pricing:**
| Scope | Price |
|---|---|
| Single workflow (marketplace entry) | **$800–1,500** |
| Multi-step system (agent + CRM + notifications) | **$2,500–5,000** |
| Ongoing automation retainer | **$750/mo** |

**Proof (the flagship case study):** *"I built an autonomous system that sources, scores, prices, and CRM-tracks 300+ job opportunities per month — LangGraph pipeline, HubSpot integration, self-evolving outcome judge — running on a $0/month VM."* (VJH machine, log-verified July 10 2026.) Plus: CTO→all-channels content pipeline, daily AI blog publisher with Buffer distribution.

**Proof #2 (freshest — published July 11 2026, use for Make/no-code buyers):** *"Claude Fable 5 appeared in Make.com on July 3; by July 11 my production build was answering my portfolio leads — HubSpot → Fable 5 (full portfolio in its 1M context) → approval draft in Telegram. 3 modules, 0 code, a few cents per lead, spam self-filtered."* Public write-up with honest cost math: https://dev.to/elenarevicheva/how-i-wired-claude-fable-5-into-makecom-to-answer-my-portfolio-leads-8-days-after-launch-h93 — this doubles as the Offer B work sample ("I'll build this same pattern on your CRM/tools").

---

### Offer C — AI Search Visibility (GEO/AEO) Audit → Fix 🥉
**For:** businesses invisible in ChatGPT/Perplexity/AI-overview answers while competitors get cited. (94% of CMOs increasing AEO budgets in 2026; AI referral traffic +357% YoY.)
**What they get:**
- **Audit ($500, 5 business days):** where they appear in AI answers today vs 3 competitors; llms.txt / schema / FAQ JSON-LD / content-structure scorecard; prioritized fix list
- **Implementation ($1,500):** schema + FAQ JSON-LD + static per-page SEO/AEO rendering + content restructure, measured before/after

**Proof:** own site — FAQPage JSON-LD (AEO score 4/10→9/10), per-article static HTML fix that took blog from duplicate-content zero to indexed, GSC-gap→auto-published-post pipeline (15 min query-to-live).

---

## 2. UPWORK PROFILE (paste-ready)

**Title (70 chars):**
`AI Agent Builder | WhatsApp & Telegram Bots | Automation | GEO/AEO`

**Hourly rate:** $45/hr (raise to $65 after 5 reviews, $85 after 15 — market for positioned AI freelancers is $80–200).

**Overview:**
> I build AI agents and automations that run real businesses — not demos.
>
> Live right now in production: a bilingual WhatsApp AI tutor with paying subscribers (voice + text + memory), an autonomous job-sourcing system that finds, scores, and CRM-tracks 300+ opportunities/month, and a daily AI content engine publishing SEO/AEO-optimized articles with zero human touch. All running 24/7 on infrastructure I administer myself.
>
> What I deliver:
> • WhatsApp / Telegram AI agents (Business API, Meta-compliant, bilingual EN/ES) — lead qualification, FAQ, booking, CRM push
> • AI automation: Make/n8n/custom Node+Python — LLM + your CRM/email/Sheets/Slack, with provider-fallback resilience so it never silently dies
> • AI search visibility (GEO/AEO): schema, llms.txt, content structure — get cited by ChatGPT/Perplexity, not just Google
>
> I work AI-augmented (Claude Code is my daily driver) — which is exactly why I ship in days what agencies quote in months, and why everything I build for you comes documented and maintainable.
>
> Based in Panama (UTC-5), native-level Spanish + English + Russian. LATAM market: 91% of conversational AI here runs on WhatsApp — I live in your customers' timezone and language.
>
> Portfolio: aideazz.xyz/portfolio

**Skills tags:** AI Chatbot, WhatsApp Business API, Telegram Bot, AI Automation, Make.com, Claude API, OpenAI API, LangGraph, HubSpot CRM, Python, Node.js, API Integration, RAG, GEO/AEO

---

## 3. FIVERR GIGS (3 gigs, paste-ready)

**Gig 1:** *"I will build a bilingual WhatsApp AI chatbot for your business"*
Basic $450 (FAQ bot, 1 language) · Standard $950 (AI + lead capture + Sheets/CRM, EN+ES) · Premium $1,500 (full agent: qualification, booking, HubSpot, human handoff, 30-day support)

**Gig 2:** *"I will automate your business workflow with AI (Make, n8n, Claude/GPT)"*
Basic $300 (1 simple automation) · Standard $800 (LLM-powered workflow + CRM) · Premium $1,500 (multi-step agent system + docs + walkthrough)

**Gig 3:** *"I will audit and fix your website's visibility in ChatGPT and AI search (GEO/AEO)"*
Basic $250 (audit + scorecard) · Standard $500 (audit + schema/FAQ JSON-LD fixes) · Premium $1,200 (full implementation + before/after report)

---

## 4. PROPOSAL TEMPLATE (Upwork — customize 3 lines per job)

> Hi {name} —
>
> {ONE sentence proving I read the post: name their tool/problem/industry.}
>
> I've built exactly this before: {pick ONE — the closest live system, with a number}. It's been running in production for {X months} — happy to demo it on a call.
>
> For your {their goal}, I'd: {3 short bullets — concrete plan with their stack named}.
>
> Timeline: {realistic days}. Fixed price: {number from offer menu}.
>
> I'm in Panama (UTC-5), fluent EN/ES, and I deliver documented work you can maintain without me.
>
> — Elena

**Rules:** never send without the 3 custom lines · always fixed-price anchor · always offer the live demo (nobody else bidding has one) · apply within 2h of posting when possible (early proposals win).

---

## 5. WHAT SELLS THE MOST (positioning cheat sheet)

| Buyer says | Lead with | Never say |
|---|---|---|
| "too many WhatsApp messages" | EspaLuz demo + $1,500 fixed | "ecosystem", "AIPA", "companions" |
| "we waste hours on X manually" | VJH 300/mo case study | architecture details unprompted |
| "nobody finds us in ChatGPT" | own-site AEO 4→9 receipts | promises of specific rankings |
| "can you build an AI agent?" | task-specific agent + Meta-compliance angle | AGI/general-assistant talk |

**Honest-identity line (interviews & calls):** "I work AI-augmented — Claude Code and Cursor are my build tools. The systems are real, in production, with paying users. I'm the person who ships."

---

## 6. WEEK-1 FIRING SEQUENCE

**Elena (the only human steps — ~2h total):**
1. Upwork: log in → paste §2 profile → submit for review (20 min)
2. Fiverr: create 3 gigs from §3 (40 min)
3. Record ONE 3-min Loom: EspaLuz answering on WhatsApp live → link it in both profiles (20 min)
4. Buy first batch of Upwork Connects (~$15) (5 min)

**Claude (mine, as soon as profiles are live):**
- Daily: scan new Upwork postings matching offers A/B/C → draft 3–5 custom proposals per day into a file for Elena's one-tap review + send
- Wire the `[CLIENT-*]` HubSpot pipeline to track marketplace proposals → replies → won (the funnel finally gets a conversion motion, measured on `contractsent`)
- Draft LinkedIn services-page copy + one launch post (ES + EN)

**Success metric (only one):** replies from real buyers per week. Target: 3+ by end of week 2. Everything else is vanity.

---

*Kit created July 11 2026 from: Upwork In-Demand Skills 2026 report, Infobip LATAM Messaging Trends 2026, Conductor State of AEO/GEO 2026, Fiverr/agency pricing guides 2026, and the July 10 live HubSpot/agent audit (verify-from-logs).*

---

## 8. INBOUND CONCIERGE — the demo that sells the offer (LIVE July 26–27 2026)

**Why this belongs in the kit:** it is the AI Growth Operator, running on Elena's own site, that a
prospect can trigger themselves. Best possible proof: *"write in the chat on my site and watch what
happens — that is what I install in yours."*

**What a prospect sees:** they write in the bubble (or the portfolio form), and within seconds get
*"We received your inquiry — AIdeazz"*. Nothing is lost if they close the tab.

**What Elena sees:** Telegram ping with their message (≤3 min), a HubSpot deal
`[CLIENT-CTO-INQUIRY] {name} — outreach`, then a Fable 5 draft with a ✅ **Send** button. One tap
sends from `aipa@aideazz.xyz`, logs a HubSpot **EMAIL activity**, and stamps `✅ ENTREGADO` on the
deal when Resend confirms delivery — or `⛔ REBOTE` + a task if it never arrived.

**The line to use on a call:** *"Most agencies stop at traffic. This is the part after traffic —
the message gets answered, the person gets a receipt, the deal gets created, the reply gets drafted,
and the CRM knows whether it actually landed. Nobody on your team touched it."*

**Honest caveats — say them, they build trust:**
- The draft is **assisted, not autonomous**: Elena taps Send. Nothing goes to a prospect unreviewed.
- Delivery ≠ interest. The engine proves the message arrived; it cannot promise a reply.
- WhatsApp is **laptop-only** and reserved for people who already replied — cold WhatsApp at volume
  gets accounts restricted (Meta restricted Elena's linked devices on July 25; the rollback is
  documented in the resilience doc).

**Live artifacts for a demo:** chat bubble on aideazz.xyz + /portfolio · the deal note's two
one-click FU buttons on 94 of 95 CLIENT-MANUAL deals · `scripts/_verify-fu-claims.cjs` output
(**88/88** messages traceable to real audit data, zero fabrication) · the Resend dashboard next to
the deal's Emails tab, showing the same send from both sides.
