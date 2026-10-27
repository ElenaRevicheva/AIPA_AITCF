# AIdeazz agent inventory — the production truth, 27 Oct 2026

Built from three sources on 27 Oct 2026 (~14:00–15:00 UTC), and nothing else:
1. **The live Oracle server** — every process, its start time, the live crontab, and the last *output* line in its logs (not the "started" line).
2. **The code** — every repo read for what each agent does and whom it hands work to (file:line evidence kept in the session reports).
3. **HubSpot** — every one of the 3,220 deals, grouped by the agent tag at the front of its name, with the stage each reached.

Rule kept throughout: an agent counts as working only if it produced output this week. "Running" is not "working".

---

## The one-line truth

One person, no developer background, built and runs **11 production capabilities on one cloud server**, with **16 processes and 35+ scheduled jobs**. They share work **through HubSpot, files and schedules — not live conversation**. The orchestration layer (AILA) is designed, not built.

---

## Each agent — what it does, and the proof it worked this week

| # | Agent | What it does (plain + technical) | Runs as | Proof of output (this week) |
|---|---|---|---|---|
| 1 | **CTO AIPA** | Her technical co-founder on Telegram (~115 commands). Reviews her GitHub pushes, turns voice notes into Trello cards and documents, searches her mail, researches employers. It is also the **hub**: every other agent writes to HubSpot through its `/api/crm-event` endpoint. | PM2 `cto-aipa` (TypeScript) | Up since 27 Oct 13:44; 94 Lead Concierge and 3,048 prospect-search log lines in 2 days; Trello colour change proven 27 Oct |
| 1a | **Lead Concierge** (inside CTO AIPA) | Website form or chat → HubSpot contact + deal → AI drafts the reply → Telegram ✅ Send / ✏️ Edit / 🗑 Skip → sent from the company domain, logged to HubSpot, delivery confirmed by webhook. Nothing sends without her tap. | part of `cto-aipa` | Daily self-test 27 Oct: **PASS — 5 checks, 4.6 s to first card** |
| 1b | **AI Visibility Audit API** | Public API: scores any site 0–100 for AI search (34 checks, 4 categories, 6 AI crawlers). The same API audits her own pages. | part of `cto-aipa` | 27 Oct: this runbook scored 100 A+ |
| 1c | **Grounded daily blog** | Collects production evidence first (processes, commits, CRM counts), refuses any number it cannot trace, then publishes to aideazz.xyz + IndexNow + Bluesky. | part of `cto-aipa`, 14:30 Panama | **One article every day 20–27 Oct** (live sitemap) |
| 1d | **Apply kit** | For every job deal she marks "🔥 I act today": cover letter, posting-shaped CV, role and technical defense, company brief, Comet prompt — as HubSpot notes. | cron every 10 min | Runs every 10 min; audit daily 13:45 UTC |
| 1e | **Reply radar** | Every 10 min reads Gmail + Zoho (read-only); any reply from a person on a deal → note + HIGH task on that deal + email to her. | cron every 10 min | Running every 10 min |
| 1f | **Sprinter** (morning briefing) | Daily audio briefing from her Trello, voice notes and commits; AWS Lambda calling CTO AIPA over HTTPS. | AWS Lambda | Dedup mark saved in CTO AIPA within the last 2 days |
| 2 | **VibeJob Hunter** | Hourly job search: 13+ boards → rules + LLM judge (5-provider fallback) → HubSpot deal → Telegram alert with ⏳ I applied / ❌ Not a fit buttons. Reads Gmail + Zoho (read-only, inbox + spam, 72 h) for employer replies. Never applies on its own (auto-apply off). | systemd `vibejobhunter` (Python, LangGraph) | 7 days: ~150 cycles found new jobs, **233 Telegram alerts**; mail watch fixed + proven 27 Oct |
| 2a | **Job-board ingest** | Google Jobs via Bright Data every 12 h, same judge. | PM2 `serpapi-jobs` | Up since 24 Oct |
| 3 | **CMO AIPA** (marketing co-founder) | Posts to LinkedIn daily (via Make.com → Buffer); prefers a real tech milestone from CTO AIPA. Also hands milestones to the X and Instagram agents. | inside `vibejobhunter` | **27 Oct 01:00 UTC: "Post completed successfully ✅"** |
| 4 | **OpenClaw** (interview coach) | Mock interviews by voice and text, EN/ES, on Telegram and her WhatsApp. Coaches from a deals sheet rebuilt from HubSpot every 30 min and from study packs. | systemd user unit `openclaw-gateway` | Active; last session 26 Oct |
| 5 | **Atlas — The Monday Move** | Every Monday reads the live ad market (Meta Ad Library via Bright Data), marks each angle ENTER / WATCH / AVOID, alerts her when one of her service markets opens, and its lead machine stages qualified local businesses into HubSpot. | PM2 `whitespace` + Monday crons | **Mon 26 Oct: 1 alert; 7 markets fed back; looked at 26 businesses, staged 8 + 1 with no website** |
| 5a | **WHITESPACE** | Free scan: the ad angle nobody in a market is running yet, with each live ad linked. | PM2 `whitespace` | Up since 25 Oct |
| 6 | **EspaLuz WhatsApp** | AI Spanish tutor for expat families on WhatsApp (Twilio), memory in PostgreSQL + pgvector, PayPal payments. | systemd `espaluz-whatsapp` | **2 PayPal payments of $7.77 completed in the last 30 days** |
| 7 | **EspaLuz Telegram** | Same tutor on Telegram, kids mode with the heroes Pere and Titi (voiced video). | systemd `espaluz-familybot` + payments webhook | Log written 27 Oct ("Video sent successfully") |
| 8 | **EspaLuz Influencer** | One post a day (23:00) to Make.com → social, two days in three for the AI Visibility campaign. | systemd `espaluz-influencer` | **26 Oct 23:01: "Sent to Make.com … 200"** |
| 9 | **Atuona** (creative co-founder) | Separate Telegram bot: poetry pages published to the atuona repo, images and video, an automated AI film studio (9 films). | inside `cto-aipa` | Up with `cto-aipa` |
| 10 | **Algom Alpha** (X @reviceva) | X posting, engagement, stream listening; prospects go to HubSpot. | PM2 `dragontrade-main`, `algom-stream`, `algom-poll` | ⚠️ **NOT WORKING since at least 17 Oct: X API "credits depleted"** — 0 posts, 0 replies, 0 likes, 0 follows. The processes run, the output is zero. Last HubSpot prospect: 21 Aug. |
| 11 | **AILA** | Long-horizon orchestration layer for the fleet. | — | **Designed, not built. Nothing runs.** |

---

## How they really work together (handoffs, with evidence in code)

They do not talk to each other live. They hand work over through **HubSpot deals and notes, shared files, and HTTP endpoints, on schedules**:

1. **Every agent → CTO AIPA → HubSpot.** VibeJob Hunter, Atlas, WHITESPACE, EspaLuz (WhatsApp, Telegram, Influencer) and Algom all write through CTO AIPA's `/api/crm-event`. One endpoint, one CRM, a name tag per agent (`[HIRING-VJH-LEAD]`, `[CLIENT-ATLAS]`, `[ESPALUZ]`, `[CLIENT-ALGOM]`…), so provenance is a filter.
2. **Website → Lead Concierge → Telegram → Resend → HubSpot.** Inquiry to approved reply, every step logged on the deal; Resend's webhook stamps delivery.
3. **Job post → VibeJob Hunter → HubSpot deal → Telegram buttons → apply kit → OpenClaw.** Her ⏳/❌ tap moves the deal; "🔥 I act today" triggers the apply kit's notes; the deals sheet (every 30 min) lets OpenClaw coach her for that exact company.
4. **Her decisions → the judge.** Her stage moves and reasons are read back hourly into the job judge's feedback file — the judge learns from her.
5. **Inbox → mail watch + reply radar → HubSpot + Telegram.** A reply to any deal becomes a note, a task and an alert.
6. **Atlas → HubSpot → Atlas.** Monday: market windows and qualified leads go in; at 10:30 the real deal stages per market are read back so next week's call learns what converted.
7. **GitHub push → CTO AIPA → CMO → LinkedIn / X / Instagram.** A `feat:` / `launch:` commit becomes a milestone; CMO serves it to LinkedIn and queues it for Algom (X) and the Influencer (Instagram).
8. **HubSpot → study packs → OpenClaw.** A case task or her deliverable becomes a fact-checked coaching pack.

---

## Real outcomes in HubSpot (all 3,220 deals, counted 27 Oct 2026)

| Agent tag | Deals | Furthest stages reached |
|---|---|---|
| `HIRING-VJH-LEAD` (job hunter, judged fit) | 333 | **119 "💬 They replied"** · 43 sent · 5 act today · 109 no fit |
| `HIRING-VJH-SERP-LEAD` (board ingest) | 1,659 | 20 sent · 3 act today · 296 no fit · 1,340 untriaged |
| `HIRING-MANUAL` (jobs she sent by hand) | 14 | 2 replied · 9 sent · 2 act today |
| `CLIENT-ATLAS` (Atlas lead machine) | 101 | **68 outreach sent** · 31 act today |
| `CLIENT-CTO-INQUIRY` (website inquiries) | 50 | 9 sent · 1 replied |
| `CLIENT-MANUAL` (her own prospects) | 128 | 122 sent · 3 replied |
| `CLIENT-CTO-SERP` + `CLIENT-CTO-INGEST` (prospect search) | 510 | 1 replied · 25 act today/this week |
| `ESPALUZ` + `ESPALUZ-ORG` | 96 | 9 sent · 1 replied |
| `CLIENT-ALGOM` (X) | 92 | none past triage (newest 21 Aug) |
| `ATUONA-ART` · `PARTNER-*` · `LICENSE*` | 8 · 8 · 3 | sent |
| `CLIENT-SERVICE-PAID` | 1 | no fit |

**Honest reading:** the machine produces and stages volume (3,220 deals) and gets real replies (119 on job deals, a handful on client deals). Paid client revenue is not yet visible in HubSpot; EspaLuz has real PayPal subscription payments.

---

## Known broken, off or not wired (truth, not apology)

- **Algom Alpha:** X API credits depleted since at least 17 Oct — zero output. Needs X credits or a decision.
- **SerpAPI** out of searches (21 Oct): the lead machine uses Google Places instead.
- **Dev.to** account suspended 11 Oct (`DEVTO_PAUSED=1`); the blog publishes on aideazz.xyz only.
- **Cold-email cycle** (Phase 4) is armed but sent 0 in the latest cycles.
- **AILA:** not built. **hive:** a fork, nothing runs.
- Dead code found: EspaLuz WhatsApp `/admin` and `/gumroad` routes (after `app.run`); `hubspot-to-trello.ts` has no caller.
- No live orchestrator: never describe the agents as "talking to each other in real time".

---

## What this proves (for her, and for anyone hiring her)

She designed a multi-agent production system, wired eleven capabilities into one CRM with per-agent provenance, kept it running on one server for nearly two years, and documents every failure with a named failure mode. The weak spots above are listed because the strong parts are real.
