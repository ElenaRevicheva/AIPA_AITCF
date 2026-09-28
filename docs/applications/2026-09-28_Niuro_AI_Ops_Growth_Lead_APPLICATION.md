# Niuro — AI Operations & Growth Lead · application kit (28 Sep 2026)

- **Found by VJH:** 27 Sep 2026 (`judge OK`), HubSpot deal `[HIRING-VJH-LEAD] AI Operations & Growth Lead @ Niuro` (I Act TODAY).
- **Posting:** https://www.getonbrd.com/jobs/machine-learning-ai/ai-operations-growth-lead-niuro-remote (GetOnBoard Job ID 63890,
  published 27 Sep, live). Apply on GetOnBoard (log in with email / Google / LinkedIn).
- **Eligibility:** "100% remote, but candidates must reside in South America, Central America or Mexico" → Panama ✅.
- **Pay:** "Gross salary $2500 - 3500 USD/month" → her floor ($3,000) is inside the range; ask for **USD 3,500**.
- **Who Niuro is:** a talent firm placing LATAM specialists on projects for US companies (initial contract, then possible long-term).
- **CV:** `docs/applications/cv-by-job/CV_Elena_Revicheva_Niuro_AI_Ops_Growth_Lead.pdf` (automation lane + job summary).

## Cover letter (paste as-is)

Dear Niuro team,

I am applying for the AI Operations & Growth Lead role. I live in Panama City (Central America, UTC-5) and work in English every day.

I operate an AI-native development environment where specialized agents handle much of the implementation execution. I own requirements, architecture, orchestration, evaluation, deployment, monitoring and production decisions. Since May 2025 that environment has run 15 long-running production services on one cloud VM: AI agents, workflow automations, a CRM growth loop and a public AI-visibility API.

Your nice-to-haves are my daily work:
- AI evaluations and feedback loops: my job-screening agent learns every hour from my recorded decisions in HubSpot. I stored the posting behind each decision and measured the judge against them (14 of 20 rejections and 8 of 18 applications agree), fixed the three defects that measurement exposed, and kept a retrieval (RAG) upgrade switched off because it scored lower than the baseline.
- Agent context and memory: RAG memory in production for a bilingual tutor bot (497 stored memories, zero retrieval errors in the last week).
- MCP and API integrations: HubSpot, Bright Data, Resend and Telegram wired into my agents, with code guards for what a model may not decide.

Bottlenecks and KPIs: before integrating a new job source, I ran it through the live gate; it cleared 76% against about 21% for the rest of the fleet. This week I found a search path silently running without its filters, fixed it, and verified the fix from production logs.

Client delivery and growth: seven years as Deputy CEO and Chief Legal Officer of a public-sector e-government operator, owning delivery and stakeholder communication at board level, then Deputy CEO for business development at a fintech. My degree is not in engineering; I bring the operator's side of this role and ship the systems through my AI environment.

My salary expectation is USD 3,500 per month.

Best regards,
Elena Revicheva
aideazz.xyz/portfolio · aipa@aideazz.xyz · +507 616 66 716

## Every claim, and where it is verified

| Claim | Source |
|---|---|
| 15 long-running services | counted on Oracle 28 Sep (8 PM2 + 7 systemd) |
| Judge learns hourly; 14/20 + 8/18; 3 defects fixed; RAG kept OFF | VJH `5782f3d`…`45f6411`, replay on real postings 28 Sep |
| 497 memories, 0 RAG errors in 7 days | EspaLuz `espaluz_embeddings` + journal, 28 Sep |
| HubSpot / Bright Data / Resend / Telegram integrations; code guards | cto-aipa + VJH code; `fit_gate.no_ai_allowed`, `latam_veto_is_wrong` |
| New source cleared 76% vs ~21% | CV "How I work" (Aug 2026 measurement) |
| Search path without filters, fixed, verified | `serpapi-jobs` on system python3 → venv, 28 Sep, first cycle `GATE REJECT ×5` |
| Deputy CEO & CLO e-gov; Deputy CEO BD fintech | CV "Earlier" |

## Honest gaps

- "Computer, mathematical, industrial or process engineering background": not hers; addressed in the letter.
- "US client SLAs": not claimed. Her delivery experience is board-level stakeholders plus on-call for her own production systems.
- "3–5 years relevant": 7 exec years + AI systems since May 2025; "flexibility for exceptional candidates" is in the posting.
