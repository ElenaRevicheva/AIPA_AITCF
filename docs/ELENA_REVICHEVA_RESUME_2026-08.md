# ELENA REVICHEVA

**AI Automation Architect · Applied AI Engineer · AI Growth Operator**
Production AI systems · Agentic automation · AI-search visibility (GEO/AEO)

aipa@aideazz.xyz | +507 616 66 716 (WhatsApp) | [LinkedIn](https://linkedin.com/in/elenarevicheva) · [GitHub](https://github.com/ElenaRevicheva) · [Portfolio](https://aideazz.xyz/portfolio)
Panama City, Panama | Remote Worldwide | UTC-5

---

## IN ONE PARAGRAPH

I build the automation that runs a business when nobody is watching — finding customers,
qualifying them, drafting the reply, updating the CRM, and reporting what happened. I
design it, deploy it, and stay on call for it. Twelve of these systems are live right now
on a single cloud VM at **$0/month infrastructure**, and they have been running for
eighteen months. Before this I spent seven years as a Deputy CEO running large-scale
digital-transformation programs at board level, so I can hold the same conversation with
the engineer building it and the owner paying for it.

**Strongest at:** turning a vague business problem into a system that is still working
six months later.

---

## WHAT THIS MEANS IF YOU RUN A BUSINESS

| You want | What I build |
|---|---|
| To be the answer ChatGPT and Google give about your industry | GEO/AEO engine — structured data, AI-crawler access, daily publishing. I scored my own site 100/100 and shipped the scoring tool as a public API. |
| Leads that get answered in minutes, not days | Inbound triage that classifies each enquiry, scores urgency 1–5, drafts a tailored reply, and waits for one tap of human approval before sending. |
| To stop losing deals in the gaps | A CRM that fills itself: 1,900+ deals with automatic source, campaign and pipeline attribution — no one typing anything in. |
| Automation you can trust with real money | Systems that **fail closed**. When my publishing pipeline cannot verify a number, it publishes nothing and tells me why. Silence beats a wrong figure. |

---

## WHAT THIS MEANS IF YOU RUN ENGINEERING

- **Nothing here is a demo.** Twelve systems in production, 24/7, eighteen months, one
  operator. I am the architect, the reviewer and the on-call engineer for all of them.
- **LLM failure is designed for, not hoped against.** Every model call runs a
  **five-provider fallback chain** (Anthropic · OpenAI · Gemini · Grok · Groq), ordered per
  use case, across six products. When Groq deprecated the models I depended on, the fleet
  kept serving — the migration was a config change, not an outage.
- **Tested.** A **130-test eval harness** (unit + integration + golden-set) runs in under a
  minute at $0 API cost, so scoring and routing changes are verified before they ship.
- **Postmortems in public.** I maintain an [AI Ops Wiki](https://aideazz.xyz/ai-ops-wiki.html)
  of my own production incidents — what broke, why, and what the failure mode is called.
  You can read how I debug before you interview me.

---

## CORE STACK

**AI Engineering** — Claude · OpenAI · Gemini · Grok · Groq · LangGraph · RAG (pgvector) · multi-provider fallback chains · evals · tool calling · agentic workflows
**AI-Augmented Development** — Cursor · Claude Code · Python · TypeScript · FastAPI · Node.js · REST APIs · webhooks
**Automation & Low-Code** — Make.com · HubSpot · Zapier-class workflow design · Playwright · Telegram · WhatsApp Business · Resend · Buffer · GitHub API
**Cloud & Operations** — Oracle Cloud (OCI) · Oracle Autonomous DB (mTLS) · AWS Lambda · PostgreSQL · Docker · PM2 · systemd · self-hosted, self-healing
**Growth Systems** — GEO · AEO · Technical SEO · JSON-LD structured data · GA4 · Search Console · UTM attribution · CRM automation

---

## EXPERIENCE

### AI Automation Architect & Founder — AIdeazz AI Lab
**Panama / Remote · 2025–Present**

Designed, built and operate an AI-first ecosystem of **12+ production systems, autonomous
agents and automation pipelines**, using AI-augmented engineering workflows end to end —
business problem → architecture → deployment → 24/7 operations. Infrastructure on the
Oracle Cloud Startup Program at **$0/month**.

---

#### AI Growth Operator — the customer-acquisition loop, automated
The full loop, orchestrated as one system rather than a pile of tools:
**AI search → research → qualification → outreach → follow-up → CRM → reporting → memory.**

- Built the acquisition engine that most agencies only assemble half of — SEO stops at
  traffic, ads stop at leads; this one carries a prospect from *discovered* to *in the CRM
  with a logged conversation*.
- **1,900+ deals, 989 contacts and 1,411 companies** in HubSpot with automated source,
  campaign and pipeline attribution written by the agents themselves.
- One-tap outreach: an AI-drafted, per-prospect email with Cc, verified PDF attachments and
  full CRM logging — and it **refuses to send** if an attachment fails to load, so a message
  can never claim a document it did not attach.
- Owner-grade reporting: every stage is visible in HubSpot and Telegram, not in a log file.

> *Operating this on my own business is what taught me the part nobody puts in a deck:
> discovery volume is easy, and the money dies after first contact. The system is built
> around that fact.*

#### AI Visibility Audit API — get recommended by AI assistants
Public product: [aideazz.xyz/api](https://aideazz.xyz/api) · `webhook.aideazz.xyz/cto/v1/visibility`

- Scores any website on how discoverable it is to ChatGPT, Perplexity and Claude — not just
  to Google — and returns the specific fixes.
- Built on the same GEO/AEO engine that scores my own site **100/100**: JSON-LD schemas,
  AI-crawler permissions, hreflang, sitemaps, canonical management.
- Daily bilingual (EN/ES) publishing picks its topic from the Search Console gap — the
  keyword currently earning the least traffic — and cross-posts for DA-90+ backlinks.

#### VibeJobHunter — autonomous discovery, qualification and outreach
- Ingests **3,600+ postings per cycle** from 14 sources, applies a hard career gate, scores
  the survivors, and surfaces only what a human should actually look at.
- **Learns from the human.** A weekly loop reads how I accepted or rejected each lead in the
  CRM — including screenshots I attach — and re-tunes what it surfaces next. Real
  human-in-the-loop, not a checkbox.
- **Measures its own inputs.** I judge a new data source by running it through the live gate
  before integrating it: the source added in August cleared **76%** against ~21% for the
  rest of the fleet, so it earned its slot on evidence rather than on vendor claims.
- LangGraph orchestration, golden-set evals, human-controlled decision gates. 600+ tailored
  applications and 250+ outreach messages, every send human-approved.

#### CTO AIPA — internal AI operations & code review
- Reviews every GitHub push and PR automatically: deterministic security and complexity
  analysis first, LLM commentary second, comment posted back to the PR.
- Daily technical briefings across 12 active repositories; Telegram and HTTP interfaces for
  on-demand questions about any repo.
- **Fail-closed publishing gate:** the daily article pipeline will not publish a number it
  cannot trace to measured evidence. When the model decorated the facts, the gate held and
  the day went silent — which was the correct outcome.

#### EspaLuz — conversational AI learning platform *(paying subscribers)*
- Bilingual AI relocation and language tutor on WhatsApp and Telegram; text, voice and image
  input; persistent per-student memory (RAG + pgvector) so it remembers each learner's level.
- PayPal subscription billing. Early users across **19 countries**. Born from my own expat
  family's need after moving to Panama.

#### CMO AIPA · WHITESPACE · ATUONA — marketing, intelligence and multimodal
- **CMO AIPA** — GEO/AEO + Technical SEO engine with automated bilingual publishing, HubSpot
  RevOps, campaign attribution and GA4 reporting; multi-channel distribution across LinkedIn
  and Instagram synced to product releases.
- **WHITESPACE** — agentic creative-angle intelligence engine for media buying and content
  strategy. Live.
- **ATUONA** — multimodal pipeline: LLM script → Flux images → text-to-video with
  multi-provider fallback (Veo, Luma, Runway, Kling) → automated assembly → published
  gallery. Six finished short films.

---

### PREVIOUS EXPERIENCE

**Operational Co-Founder — OmniBazaar** (decentralised e-commerce) · 2024–2025

**Deputy CEO & Chief Legal Officer — JSC "E-GOV OPERATOR"** (Russia) · 2011–2018
Seven years at board level running large-scale public-sector digital transformation:
cross-functional teams across IT, legal and compliance in a heavily regulated environment.
*This is why I can explain an AI system to the person signing the cheque.*

**Deputy CEO, Business Development — Fundery LLC** (fintech) · 2017–2018
ICO compliance, investor relations, blockchain launch strategy.

---

## EDUCATION & CERTIFICATIONS

- **Anthropic Academy** — Claude Certification Program · 2026 · *in progress*
- **Polkadot Blockchain Academy** (PBA-X Wave #3) · 2025
- **How-To-DAO** Cohort Graduate · 2025
- **MA Social Psychology** — Penza State University · 2018
- **Blockchain Regulation** — MGIMO, Moscow · 2017
- **Presidential Program for Executive Management** — RANEPA, Moscow · 2015
- **Internship** — Nyskapingsparken Innovation Park, Bergen, Norway

## LANGUAGES

Russian (Native) · English (Advanced) · Spanish (Intermediate) · French (Elementary)

## TARGET ROLES

AI Automation Architect · Applied AI Engineer · AI Solutions / Forward-Deployed Engineer
Automation Stream / Tech Lead · Internal AI Tools · AI Operations · GEO-AEO / Technical SEO Lead

Comfortable as an embedded builder or an internal lead, across business and technical teams.
**Open to:** Full-time · Contract · Remote
