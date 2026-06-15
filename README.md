# CTO AIPA — Production AI Code Review & Agent Orchestration System

[![Web Data UNLOCKED](https://img.shields.io/badge/Web%20Data%20UNLOCKED-Bright%20Data%20Hackathon-orange)](https://lablab.ai/ai-hackathons/brightdata-ai-agents-web-data-hackathon) [![Track 1](https://img.shields.io/badge/Track%201-GTM%20Intelligence-blue)](https://lablab.ai/ai-hackathons/brightdata-ai-agents-web-data-hackathon) [![Bright Data](https://img.shields.io/badge/Bright%20Data-4%20products%20in%20production-success)](https://brightdata.com)

> **Web Data UNLOCKED hackathon submission (May 2026):** Track 1 — GTM Intelligence. Four Bright Data products in production (Web Unlocker, SERP API, Scraping Browser, MCP Server) + autonomous Claude tool-use loop exposing them as `/research_company`, `/research_employer`, `/research_competitor` Telegram commands. See [Live Web Data Layer](#-live-web-data-layer-may-2026) below.


Single TypeScript service that:

- Automatically reviews every PR and push
- Routes between LLMs based on criticality
- Persists technical memory in Oracle Autonomous DB
- Exposes technical Q&A via API and Telegram

Deployed on Oracle Cloud. PM2-managed. <$1/month operational cost.

[![Status](https://img.shields.io/badge/status-live-brightgreen)]()
[![Version](https://img.shields.io/badge/version-4.0.0-blue)]()
[![Cost](https://img.shields.io/badge/cost-%240%2Fmonth-success)]()
[![AI](https://img.shields.io/badge/AI-Claude%20Opus%204-purple)]()
[![Oracle Cloud](https://img.shields.io/badge/Oracle%20Cloud-Production-red)]()

> **Elena Revicheva** · [AIdeazz](https://aideazz.xyz) · [LinkedIn](https://linkedin.com/in/elenarevicheva)

---

### Screenshots

| [![Architecture / health](docs/assets/readme-architecture.png)](docs/assets/readme-architecture.png) | [![PR review](docs/assets/readme-pr-review.png)](docs/assets/readme-pr-review.png) |
|:---:|:---:|
| **1. Architecture or health** — System overview or `GET /` response | **2. PR review** — GitHub PR or commit with CTO review comment |
| [![Telegram CTO](docs/assets/readme-telegram.png)](docs/assets/readme-telegram.png) | [![Atuona](docs/assets/readme-atuona.png)](docs/assets/readme-atuona.png) |
| **3. Telegram** — CTO bot menu or `/ask` / `/daily` response | **4. Atuona** — `/create` or `/visualize` output |

*Add images to `docs/assets/` (see [docs/assets/README.md](docs/assets/README.md)).*  
PR and commit reviews are triggered by the GitHub webhook to CTO AIPA.

---

### Architecture (high level)

```mermaid
flowchart LR
  subgraph Triggers
    GH[GitHub PR/Push]
    TG[Telegram]
    API[HTTP /ask-cto]
  end
  subgraph Service["Node + Express"]
    R[Rules: security, complexity]
    M[Model router]
    L[LLM: Claude / Groq]
  end
  subgraph Persistence
    DB[(Oracle)]
    FS[atuona-state.json]
  end
  GH --> R --> M --> L --> DB
  TG --> M --> L --> DB
  API --> M --> L --> DB
  L --> FS
```

- **Triggers:** GitHub webhook, Telegram (Grammy), HTTP `POST /ask-cto`.
- **Service:** Single process. Deterministic rules run first; then model router; then LLM. Results persisted to Oracle (and file for Atuona).
- **Persistence:** Oracle Autonomous DB (mTLS) for CTO memory, tech debt, context; JSON file for Atuona creative state.

---

### Orchestration flow (bullet pipeline)

**Code review (PR or push):**

1. GitHub sends webhook → Express receives.
2. Fetch diff; run **deterministic** checks (security, complexity, architecture patterns).
3. **Route:** If critical (security/payment/keywords) or explicit override → Claude Opus 4; else → Groq Llama 3.3 70B.
4. Build prompt with diff + rule results + last N memories from Oracle.
5. LLM returns review text → post comment on PR/commit.
6. Save to `aipa_memory` (Oracle); notify CMO webhook (non-blocking).

**Ask CTO (API or Telegram):**

1. Request (JSON or message) → load conversation context from Oracle.
2. **Route:** Always Claude Opus 4 for strategic Q&A.
3. LLM returns answer → save to `aipa_memory` and conversation context; respond to client.

**Atuona (Telegram):**

1. Message/voice → Whisper for transcription if voice.
2. Load `atuona-state.json` (mood, creative memory); select mood; inject knowledge + anti-repetition lists.
3. Claude Opus 4 generates → `extractAndTrackFromResponse()` updates creative memory → save state; reply.

---

### Model routing logic

| Trigger / task | Model | Reason |
|----------------|--------|--------|
| Code review, **critical** (security, payment, or `useClaudeForCritical`) | Claude Opus 4 | Best for security and architecture reasoning. |
| Code review, **standard** | Groq Llama 3.3 70B | Fast, free tier; sufficient for routine style/complexity. |
| Ask CTO (API or Telegram) | Claude Opus 4 | Strategic and multi-repo context. |
| Voice message (Telegram) | Whisper (Groq) → then Claude Opus 4 | Transcription then same as text. |
| Atuona (all text/creative) | Claude Opus 4 | Consistency and creative quality. |
| Atuona image/video | Replicate / Runway / Luma / DALL·E | Per-request availability. |

Configurable via env: `CRITICAL_MODEL`, `STRATEGIC_MODEL`, `STANDARD_MODEL`.

---

### Why deterministic + LLM split

- **Deterministic rules** handle everything that must be consistent and cheap: regex/pattern checks for SQL injection, hardcoded secrets, XSS, `eval`, debug code; line-count and nesting for complexity; detection of patterns (async/await, try-catch, types). No token cost, no flakiness, instant. The LLM then gets a structured summary (e.g. “3 high, 2 low”) and the diff, and focuses on synthesis and advice.
- **LLM** is used only where reasoning or language is needed: review narrative, answer to “How should I structure auth?”, dialogue, creative text. We avoid using the model for things that can be computed.
- **Result:** Lower cost (Groq for most reviews), predictable security/complexity signals, and a single place to tune “when to use Claude” (critical path and config).

---

### Data lifecycle (how memory tables are used)

| Store | Written when | Read when |
|-------|----------------|-----------|
| **aipa_memory** | After every code review and every Ask CTO answer. | Before review (last N for this repo/action); before Ask CTO (recent Q&A). |
| **tech_debt** | When user or CTO records tech debt via Telegram/API. | When listing or resolving debt. |
| **arch_decisions** | When a decision is recorded. | When listing decisions for context. |
| **pending_code** | When CTO proposes code (e.g. `/code`, `/fix`) and waits for approval. | When user approves or when loading pending list. |
| **alert_preferences** | When user toggles alerts/daily briefing. | When running cron (briefing, alerts). |
| **conversation_context** | When user sends files/questions; when CTO responds. | At start of each Telegram session (7-day window). |
| **knowledge_base** | When user adds knowledge. | When answering with project/category context. |
| **atuona-state.json** | After every Atuona response: metaphors, paintings, fingerprints, etc. | On every Atuona message: mood, creative memory, anti-repetition lists. |

All Oracle writes are best-effort (errors logged, no throw to client). Reads fall back to empty/default so the app stays up if DB is temporarily unavailable.

---

### Failure handling & monitoring

| Layer | Behavior |
|-------|----------|
| **HTTP/Webhook** | Try/catch per request; 500 with message on uncaught error; CMO webhook failure → update stored in memory for later sync. |
| **Oracle** | Connection errors logged; `getRelevantMemory` / `saveMemory` return empty or no-op on failure so the request can continue (e.g. review without prior context). |
| **LLM APIs** | Anthropic/Groq errors caught and logged; user gets a short “service temporarily unavailable” style message. |
| **Telegram** | Grammy error handler; failed sends logged; no process crash. |
| **Process** | PM2: restart on exit; startup on boot. External cron hits `GET /` every 5 min and restarts service if needed (see Oracle resilience docs). |
| **Logs** | stdout/stderr → `pm2 logs cto-aipa`. No PII in logs; stack traces on errors. |

---

## 🎯 What CTO AIPA does

- 🔍 **Reviews every code change** (PRs AND direct pushes to main)
- 💬 **Answers technical questions** anytime via API or Telegram
- 🧠 **Knows your entire ecosystem** (11 AIdeazz repositories)
- 🔐 **Detects security vulnerabilities** before production
- 📊 **Analyzes architecture** and suggests improvements
- 🤝 **Coordinates with CMO AIPA** for LinkedIn announcements
- ☀️ **Daily briefings** - Start each day informed
- 🔔 **Proactive alerts** - CTO watches your ecosystem 24/7
- 🎤 **Voice messages** - Talk naturally via Telegram
- ⚡ **Runs 24/7** on Oracle Cloud (PM2, health checks, cron)

No code review bottlenecks; strategic technical guidance on demand.

---

## What's in v4.0

- Oracle Cloud deployment (PM2, startup credits)
- Atuona: persistent creative memory, anti-repetition, multi-modal (text + image + video via Replicate/Runway/Luma)
- Repository cleanup: docs in `docs/`, strengthened `.gitignore`

---

## What's new since v4.0 (May 2026 hackathon week)

Six commits this week that turn CTO AIPA into a live-web-powered GTM intelligence system, not just a code-review bot:

- **Autonomous research agent** (`src/research-agent.ts`): Claude tool-use loop exposing Bright Data primitives as agent tools. Three modes — client / employer / competitor — surfaced as `/research_company`, `/research_employer`, `/research_competitor` Telegram commands.
- **Bright Data 4-product integration** (`src/brightdata-enrich.ts`, `src/serpapi-prospects.ts`, `.mcp.json`): Web Unlocker for enrichment + SERP API for prospect discovery + Scraping Browser for JS-heavy pages + MCP Server for IDE-side use, all sharing one credential set.
- **HubSpot Lead Brief with freshness buckets** (`src/lead-triage.ts`): daily 8 AM Panama brief in Telegram, grouped 🆕 NEW (≤24h) / 🔥 ACTIVE (1-7d) / ⏰ AGING (>7d). Silent skip on quiet days (zero noise).
- **Daily blog publisher hardening** (`src/daily-blog-publisher.ts`): sliding-window mutex prevents accidental double-publishes; always-fire Telegram notify on every outcome (success / skip / failure).
- **dragontrade-main crashloop fix** (separate `dragontrade-agent` repo + Oracle `check_oracle_health.sh`): jq-based pm2 status check replaces a brittle grep that wrongly restarted the bot every 5 minutes for weeks. Engagement loop now runs autonomously, replying to and following real users on `@reviceva`.
- **Outreach hardening**: bogus-email retry loop fixed in `src/outreach.ts` + `markOutreachDraftStatus` + auto-mark-invalid on Resend 422.

See **`HACKATHON_SUBMISSION.md`** in the private docs repo (`aideazz-private-docs/docs/01-career-applications/Accelerator-Applications/BrightData-WebDataUnlocked-2026/`) for the full submission kit.

---

## What's new (late May – June 2026)

The engine grew four durable capabilities — each one earned by a real production incident, not a roadmap:

- **Voice Growth Engine + "Building in Public" Podcast** (`src/voice-growth-engine.ts`, `src/podcast-*.ts`): one voice note → Speechmatics transcription → bilingual blog + LinkedIn/IG atoms (Buffer drip) + a published podcast episode, all UTM-attributed into HubSpot. Auto-publishing RSS + branded site ([podcast.aideazz.xyz](https://podcast.aideazz.xyz)) — **live on Spotify, YouTube, Listen Notes, and Podcast Index**. Episodes from real voice (`/podcast`) or AI-narrated (`/podcast_ai`).
- **Credit-exhaustion resilience, engine-wide** (`src/llm-resilience.ts` + call-site hardening): every agent falls back Anthropic → Groq on credit exhaustion. When Anthropic credits actually ran out, the daily blog still failed — twice — exposing two deeper gaps that are now fixed: a **tolerant article parser** (Groq drops the XML envelope Claude obeys) and a **TPM-aware retry** (all agents share Groq's 12K tokens/min, so the big blog call retries through congestion). Proof: a full article was generated, parsed, quality-gated, and cross-posted to Dev.to + aideazz.xyz **entirely on the free fallback**.
- **Buying-intent lead gate + Bright Data-first discovery** (`src/serpapi-prospects.ts`): a Google result is a *page*, not a prospect. An LLM intent classifier now admits only people **actively seeking** technical/AI/build help — articles, news, job-seekers, and freelancers-for-hire are dropped, and deals are named by intent (*"Non-technical founder seeking technical co-founder for music infrastructure startup"*), not by headline. When the paid SERP API quota died (429, no top-up), discovery migrated to **Bright Data organic SERP the same day** — the legacy `serpapi-*` names remain, but Bright Data runs inside.
- **HubSpot as a revenue surface, not a data dump** (`src/hubspot-client.ts`, `scripts/`): enriched writes (company domain/website/description, `dealtype`, clean contact names, placeholder-domain guard), a quality gate that keeps personal-Gmail prospects out of the "I Act TODAY" view, plus two idempotent operator tools — `carve-revenue-pipeline.cjs` (demote non-contactable deals out of action stages, reversible log) and `cleanup-junk-crm.cjs` (archive headline-era junk: 198 deals + 145 companies + 63 contacts in the June 10 pass). Every record left is a real job lead or a real prospect.

Cross-repo, same period: VibeJobHunter's two dead hiring paths were restored (missing-ID drop fix + SerpAPI→Bright Data jobs migration) — see [that repo's README](https://github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF) for the engineering highlights.

---

## 🚀 How To Use Your CTO

**Quick connect:** See **[docs/CONNECT_TO_CTO_AIPA.md](docs/CONNECT_TO_CTO_AIPA.md)** for all ways to reach your CTO (Telegram, terminal, API, GitHub).

### 📍 Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check & status |
| `/ask-cto` | POST | Ask any technical question |
| `/webhook/github` | POST | Receives GitHub webhooks |
| `/cmo-updates` | GET | View pending CMO updates |
| `/tech-milestones` | GET | View tech milestones |
| **Telegram Bot** | - | Chat with CTO from your phone! |

### 💬 Ask CTO - Get Technical Advice Anytime

**From any terminal:**
```bash
curl -X POST http://<your-server-ip>:3000/ask-cto \
  -H "Content-Type: application/json" \
  -d '{"question":"Should I use MongoDB or PostgreSQL for my project?"}'
```

**With context:**
```bash
curl -X POST http://<your-server-ip>:3000/ask-cto \
  -H "Content-Type: application/json" \
  -d '{
    "question": "How should I structure the authentication?",
    "repo": "MyProject",
    "context": "Currently using JWT tokens"
  }'
```

### 🔍 Automatic Code Reviews

**For Pull Requests:**
1. Create a PR in any connected repo
2. CTO AIPA automatically reviews within 30 seconds
3. Review comment appears on the PR

**For Direct Pushes:**
1. Push to `main` or `master` branch
2. CTO AIPA reviews the commits
3. Review comment appears on the commit

---

## 🤖 AI Models

CTO AIPA uses the **best AI models** for each task:

| Task | Model | Why |
|------|-------|-----|
| Critical Reviews | Claude Opus 4 | Best for security & architecture |
| Ask CTO Questions | Claude Opus 4 | Best for strategic thinking |
| Standard Reviews | Llama 3.3 70B | Fast & free via Groq |
| Voice Transcription | Whisper (Groq) | Fast & accurate |
| Autonomous research loop (`/research_*`) | Claude Sonnet 4.5 | Tool-use over Bright Data; balanced cost + reasoning |
| Lead/employer/competitor live-web data | Bright Data (Web Unlocker, SERP API, Scraping Browser, MCP) | Bypasses bot detection, JS-renders, returns parsed Google JSON |

### Configuration

Edit `.env` on your server:
```bash
CRITICAL_MODEL=claude-opus-4-8
STRATEGIC_MODEL=claude-opus-4-8
STANDARD_MODEL=llama-3.3-70b-versatile
MAX_TOKENS=8192
```

*(Orchestration, model routing, and data lifecycle are described in the sections at the top.)*

---

## 🌐 Live Web Data Layer (May 2026)

Every agent in this stack that touches the open web does it through Bright Data — one shared `BRIGHTDATA_API_TOKEN` + one zone, four products in production:

| Bright Data product | Where it lives in code | What it does |
|---|---|---|
| **Web Unlocker** | `src/brightdata-enrich.ts` — `bdFetch`, `enrichLeadWebsite`, `enrichLinkedInCompany`, `enrichCrunchbase`, `enrichCompanyFull` | Every CLIENT and HIRING HubSpot deal gets auto-enriched with founder names, tech stack, team size, funding scraped from the company's website + LinkedIn + Crunchbase. Also powers VJH LinkedIn Jobs feed (120 jobs/cycle). |
| **SERP API** | `src/brightdata-enrich.ts` `bdSerpSearch` (Web Unlocker proxy + `brd_json=1`) + `src/serpapi-prospects.ts` `fetchGoogleSearch` | Synchronous Google results parsed as JSON. Replaced the legacy paid SerpAPI competitor. Powers the 6-hour prospect-discovery cron + the on-demand research agent. |
| **Scraping Browser** | `src/brightdata-enrich.ts` `bdScrapingBrowserFetch` (via `render:true`) + `bdSmartFetch` orchestrator | Full headless browser with JS execution for LinkedIn profile pages and SPAs. `bdSmartFetch` tries Web Unlocker first (cheap), escalates to Scraping Browser only when content is thin or JS-gated. |
| **MCP Server** | `.mcp.json` at repo root exposes `@brightdata/mcp` to Claude Code | Developer-side: `search_engine`, `scrape_as_markdown`, `discover` tools available from inside Cursor/Claude Code when working on this repo. |

### Autonomous research agent (`src/research-agent.ts`)

Three Telegram commands wrap a Claude tool-use loop that exposes the Bright Data primitives as agent tools (`bd_serp_search`, `bd_unlock_url`, `bd_scrape_browser`). Claude itself decides how many calls to make, which URLs to fetch, when to stop. Budget: max 8 tool calls or 120s per command.

| Command | Mode | Output |
|---|---|---|
| `/research_company <name>` | client | Founder, pain signals, decision-maker, sendable pitch angle, HOT/WARM/COLD verdict |
| `/research_employer <name>` | employer | Recent funding, hiring patterns, tech stack, comp signals, application angle |
| `/research_competitor <domain>` | competitor | Top-ranking content (last 3 months), 3-5 blog topic gaps, schema/AEO patterns to match or beat |

Live proof (decircle.io, client mode): 86 seconds, 7 Bright Data tool calls, returned a sendable LinkedIn DM pitch angle the operator could copy-paste.

### Signal flow (end-to-end)

```
External web → Bright Data (Web Unlocker / SERP / Scraping Browser)
            → Claude (Sonnet 4.5 tool-use loop in research-agent.ts, or Opus 4 in code-review path)
            → /api/crm-event (unified Bearer-auth hub)
            → HubSpot deal ([CLIENT-*] / [HIRING-VJH-*] / [CLIENT-ALGOM] prefixes)
            → HubSpot → Trello current-month "Kira {Mes} 2026" board (urgent stages)
            → Lead Brief Telegram (8 AM Panama, 🆕 / 🔥 / ⏰ freshness buckets, silent on quiet days)
```

---

## 🧠 AIdeazz Ecosystem

CTO AIPA knows and monitors **11 repositories**:

| # | Repo | Role |
|---|------|------|
| 1 | **AIPA_AITCF** | CTO AIPA (this repo) |
| 2 | **VibeJobHunterAIPA_AIMCF** | CMO AIPA + Job Hunter |
| 3 | **EspaLuzWhatsApp** | AI Spanish Tutor |
| 4 | **EspaLuz_Influencer** | EspaLuz Marketing |
| 5 | **EspaLuzFamilybot** | Family Bot Version |
| 6 | **aideazz** | Main Website |
| 7 | **dragontrade-agent** | Web3 Trading Assistant |
| 8 | **atuona** | NFT Gallery |
| 9 | **ascent-saas-builder** | SaaS Builder Tool |
| 10 | **aideazz-private-docs** | Private Documentation |
| 11 | **aideazz-pitch-deck** | Investor Pitch Materials |

---

## 📱 Telegram Bot

Chat with your CTO from your phone — now with voice messages!

### Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) on Telegram
2. Add to `.env` on your server:
   ```
   TELEGRAM_BOT_TOKEN=<your-bot-token>
   TELEGRAM_AUTHORIZED_USERS=<your-telegram-user-id>
   ```
3. Restart: `pm2 restart cto-aipa`

### Commands

| Command | Description |
|---------|-------------|
| `/menu` | 📋 Show organized menu of all commands |
| `/learn <topic>` | 🎓 Start a coding lesson |
| `/exercise` | 🏋️ Get a coding challenge |
| `/explain <concept>` | 📚 Explain any coding concept |
| `/code <repo> <task>` | 💻 CTO writes code & creates PR! |
| `/fix <repo> <issue>` | 🔧 CTO fixes bugs & creates PR! |
| `/research_company <name>` | 🔥 Autonomous Claude + Bright Data research on a CLIENT prospect → sendable pitch angle (~90s) |
| `/research_employer <name>` | 🎯 Same agent, employer mode → hiring intel + application angle for Elena |
| `/research_competitor <domain>` | 📚 Same agent, competitor SEO/AEO gap analysis → blog topic suggestions for the daily publisher |
| `/triage_urgent` | 📥 Lead Brief on demand — HubSpot actionable deals bucketed by freshness (🆕 NEW / 🔥 ACTIVE / ⏰ AGING) |
| `/stats` | 📊 Ecosystem metrics & weekly activity |
| `/daily` | ☀️ Get your morning briefing |
| `/idea <text>` | 💡 Capture startup ideas |
| `/ideas` | 💾 View all saved ideas |
| `/ask <question>` | 💬 Ask any technical question |
| `/review <repo>` | 🔍 Review latest commit |
| `/repos` | 📋 List all repositories |
| `/alerts` | 🔔 Toggle proactive alerts |
| `/status` | 🏥 Service health check |
| `/announce` | 📢 Announce tech milestone |

### 📸 Screenshot Analysis

Send any image and get instant AI analysis:
- **Error screenshots** → Identify bug and suggest fix
- **UI mockups** → UX feedback and improvements
- **Architecture diagrams** → Review and optimization
- **Code snippets** → Quick code review

Just send a photo - no command needed!

### 🎤 Voice Messages

Just hold the mic button and talk naturally:
- "What should I focus on today?"
- "How do I add caching to my project?"
- "Review my architecture decisions"

Your voice is transcribed by Whisper (Groq) and processed by Claude Opus 4.

### ☀️ Daily Briefings

Every day at **8 AM Panama time**, you'll receive:
- Ecosystem health status
- Recent repo activity
- Stale repos that need attention
- AI-generated focus suggestion for the day

Use `/alerts` to toggle on/off.

### 🔔 Proactive Alerts

CTO AIPA monitors your ecosystem and alerts you about:
- ⚠️ Repos with no commits in 5+ days
- 🚨 Services that go offline
- 📊 Important status changes

Alerts run every 4 hours automatically.

---

## Atuona (second agent in same process)

Second Telegram bot in this repo: **persistent creative memory**, **anti-repetition** (response fingerprints, used metaphors/paintings/insights tracked), **multi-modal orchestration** (text via Claude Opus 4; image/video via Replicate, Runway, Luma, DALL·E). State in `atuona-state.json` (local file, not in repo); every response runs through `extractAndTrackFromResponse()` and persists. Commands: `/create`, `/scene`, `/dialogue`, `/visualize`, `/publish`, etc. Set `ATUONA_BOT_TOKEN` in `.env` and restart PM2.

---

## 🤝 CMO Integration

CTO AIPA automatically notifies CMO AIPA when:
- A PR is reviewed
- A push is analyzed
- Technical milestones are reached

**CMO then:**
- Posts about tech updates on LinkedIn
- Schedules announcements at optimal times

---

## 🏗️ Technical Architecture (detailed)

*(Simple diagram and data flow are in the [Architecture](#architecture-high-level) and [Orchestration flow](#orchestration-flow-bullet-pipeline) sections at the top.)*

Single Node/Express process: GitHub webhooks and HTTP API drive the CTO pipeline; Telegram serves both CTO and Atuona via two bots. Oracle holds all persistent state; CMO is notified via webhook for LinkedIn-ready updates.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           AIdeazz AIPA Suite v4.0                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────────────────────────────────────────────────────────┐      │
│   │                  🤖 CTO AIPA (Tech Co-Founder)                │      │
│   │   GitHub Webhook ────► Express Server ────► AI Analysis       │      │
│   │        │                    │                   │             │      │
│   │        ▼                    ▼                   ▼             │      │
│   │   [PR or Push]        [Oracle ATP]      [Claude Opus 4]       │      │
│   │        │                    │            [Groq Llama/Whisper] │      │
│   │        ▼                    ▼                   │             │      │
│   │   GitHub Comment      Memory Storage            ▼             │      │
│   │        └──────────────► CMO AIPA ──────► LinkedIn Post        │      │
│   │                                                               │      │
│   │   Telegram Bot                                                │      │
│   │   📸 Photos │ 🎤 Voice │ 💡 Ideas │ 💻 Code │ 🎓 Learn        │      │
│   └──────────────────────────────────────────────────────────────┘      │
│                              │                                          │
│                              ▼                                          │
│   ┌──────────────────────────────────────────────────────────────┐      │
│   │                🎭 ATUONA (Creative Co-Founder)                │      │
│   │                                                               │      │
│   │   Input ──► Emotional Intelligence (13 moods)                 │      │
│   │                    │                                          │      │
│   │                    ▼                                          │      │
│   │         Associative Intelligence (7 domains, 28 insights)    │      │
│   │         + Knowledge Base (11 domains)                        │      │
│   │                    │                                          │      │
│   │                    ▼                                          │      │
│   │         [Claude Opus 4] ──► extractAndTrackFromResponse()    │      │
│   │                    │              │                           │      │
│   │                    ▼              ▼                           │      │
│   │         /publish ──► GitHub   Creative Memory (persistent)   │      │
│   │              │                [atuona-state.json]             │      │
│   │              ▼                                                │      │
│   │         atuona.xyz (Fleek/IPFS)                              │      │
│   │   📝 Create │ 🎨 Scene │ 💬 Dialogue │ ✨ Inspire │ 🎬 Film    │      │
│   └──────────────────────────────────────────────────────────────┘      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Stack:**
- **Backend:** TypeScript 5.7, Node.js 20, Express.js
- **AI:** Claude Opus 4 (critical), Groq Llama 3.3 70B (fast), Groq Whisper (voice)
- **Database:** Oracle Autonomous Database 26ai (mTLS encrypted, Always Free)
- **Infrastructure:** Oracle Cloud VM.Standard.E5.Flex, Ubuntu 24.04, PM2
- **Integrations:** GitHub API, CMO AIPA (Railway), Telegram Bot API
- **Scheduling:** node-cron for daily briefings and health checks

---

## 🔒 Security Features

- ✅ Hardcoded credentials detection
- ✅ SQL injection vulnerability scanning
- ✅ XSS vulnerability detection
- ✅ Dangerous function usage (eval)
- ✅ Debug code detection (console.log)
- ✅ Code complexity analysis
- ✅ Architecture pattern recognition
- ✅ mTLS database encryption with wallet

---

## 💰 Cost Analysis

| Component | Service | Monthly Cost |
|-----------|---------|--------------|
| Compute (1 OCPU, 12GB RAM) | Oracle Cloud | $0 (Startup Credits) |
| Database (26ai, Always Free) | Oracle ATP | $0 |
| Storage (50GB) | Oracle Block Storage | $0 |
| AI - Standard Reviews | Groq (free tier) | $0 |
| AI - Critical Reviews | Anthropic Claude | ~$0.50 |
| Live web data — enrichment + SERP + Scraping Browser | Bright Data (hackathon credits: $250 promo + $250 MKT through Jun 24 2026) | $0 |
| Autonomous research agent (Claude Sonnet 4.5 tool-use) | Anthropic Claude | ~$0.10 per /research_* call |
| **Total** | | **< $1/month** (research calls pay-per-use, ~$0.05–0.10 each) |

---

## Roadmap

- [x] v4.0 (Feb 2026): Code review pipeline, Ask CTO, Oracle persistence, Atuona (persistent creative memory, multi-modal).
- [x] v4.1 (May 2026 — hackathon week): Live web data layer (4 Bright Data products in one stack), autonomous Claude tool-use research agent (`/research_*` Telegram commands), HubSpot Lead Brief with freshness buckets (🆕 / 🔥 / ⏰), dragontrade-main crashloop permanent fix, outreach bogus-email retry loop fix, daily blog publisher sliding-window mutex + always-fire Telegram notify.
- [ ] Next: auto-add competitor-mode topic suggestions to `DAILY_BLOG_TOPIC_BRIEFS` rotation; daily SERP rank-tracking cron; wire `/research_company` output to auto-create HubSpot deal notes; CMO LinkedIn engagement return webhook.

---

## 🔧 Server Management

**Check status:**
```bash
pm2 status
```

**View logs:**
```bash
pm2 logs cto-aipa --lines 50
```

**Restart service:**
```bash
pm2 restart cto-aipa
```

**Update code:**
```bash
cd ~/cto-aipa
git pull origin main
npm run build
pm2 restart cto-aipa
```

---

## 📋 Environment Variables

Create a `.env` file with these variables (do not commit to git!):

```bash
# Oracle Database (mTLS with Wallet)
DB_USER=<your-db-user>
DB_PASSWORD=<your-db-password>
DB_SERVICE_NAME=<your-service-name>
WALLET_PASSWORD=<your-wallet-password>

# AI APIs
GROQ_API_KEY=<your-groq-api-key>
ANTHROPIC_API_KEY=<your-anthropic-api-key>
OPENAI_API_KEY=<your-openai-api-key>

# GitHub
GITHUB_TOKEN=<your-github-token>
# Optional aliases (any one works):
# GITHUB_PAT=<your-github-token>
# GH_TOKEN=<your-github-token>

# Telegram Bots
TELEGRAM_BOT_TOKEN=<your-cto-bot-token>
TELEGRAM_AUTHORIZED_USERS=<your-telegram-user-id>
ATUONA_BOT_TOKEN=<your-atuona-bot-token>

# Optional: Ask CTO from this repo (npm run ask-cto)
CTO_AIPA_URL=http://YOUR_SERVER_IP:3000
# Optional: URL shown in server startup logs (no hardcoded IPs in code)
CTO_AIPA_PUBLIC_URL=http://YOUR_SERVER_IP:3000

# Optional: AI Image/Video Generation
REPLICATE_API_TOKEN=<your-replicate-token>
RUNWAY_API_KEY=<your-runway-key>
LUMA_API_KEY=<your-luma-key>
```

---

## 📬 Contact

**Elena Revicheva** — Founder, AIdeazz · Open to roles in Applied AI, AI Product, AI Systems, Agent Engineering, AI Solutions.

- 📧 aipa@aideazz.xyz
- 🌐 [aideazz.xyz](https://aideazz.xyz)
- 💼 [LinkedIn](https://linkedin.com/in/elenarevicheva)

---

## 🎉 Highlights (what this repo demonstrates)

| Area | What’s in this repo |
|------|----------------------|
| **LLM orchestration** | Multi-step pipeline (analyze → route → generate → persist); two agent personas (CTO + Atuona); model routing by task criticality; engine-wide Anthropic→Groq credit-exhaustion fallback (proven in production). |
| **Lead & revenue engine** | LLM buying-intent gate over Bright Data SERP discovery; HubSpot enrichment (domain/description/dealtype, dedup, source prefixes); operator tools for pipeline carving and junk archiving. |
| **Voice & content** | Voice note → bilingual blog + social atoms + published podcast episode (Spotify / YouTube / Listen Notes / Podcast Index); resilient daily blog with GEO/AEO structured data. |
| **Integrations** | GitHub API (webhooks, PR comments), Telegram (Grammy, 2 bots), Oracle Autonomous DB (mTLS), HubSpot CRM, Bright Data, Speechmatics, Buffer, Express HTTP, CMO webhook, Replicate/Runway/Luma/OpenAI for image & video. |
| **Persistence & memory** | Oracle tables (reviews, tech debt, arch decisions, lessons, alerts, conversation context, knowledge base); file-based creative state with extraction and anti-repetition. |
| **Production** | Live on Oracle Cloud; PM2, cron, health endpoint; < $1/month; security scanning and structured error handling. |
| **Codebase** | ~35k LOC TypeScript; single deployable service; clear separation between CTO flow, Atuona flow, and shared DB. |

---

**Version 4.2.0 | June 2026 | Production + Buying-Intent Lead Engine + Voice/Podcast Engine + Credit-Exhaustion Resilience**
