# What VJH is searching for — read from production, 27 Sep 2026

Every figure below is from Oracle, not from config: the PM2 log of `serpapi-jobs`, the systemd journal of
`vibejobhunter`, and HubSpot. No simulation, no dry run.

**Deployed code = `main`.** Oracle's VJH `HEAD` shows `40b32e9`, but the 5 files changed by the three later
commits (`5c50c09`, `c0a3b81`, `18d3bf1`) are on disk and byte-identical to `origin/main` (mtime 20 Sep);
`serpapi-jobs` restarted 20 Sep 18:39 and `vibejobhunter` 25 Sep 06:25 — both after the files. Only the git
bookkeeping lags (files were deployed by copy).

## 1. Paid search — Google Jobs via Bright Data (`serpapi-jobs`, PM2, every 12 h)

16 queries (`src/search/serpapi_jobs_ingest.py` · `JOBS_QUERIES`). Last 10 runs from the PM2 log:

| Query | OK | Failed (0 results) |
|---|---|---|
| fractional CTO remote | 8 | 2 |
| AI automation specialist remote latin america | 8 | 2 |
| technical account manager AI automation remote | 7 | 3 |
| AI automation lead remote startup | 8 | 2 |
| solutions architect AI startup remote | 7 | 3 |
| AI automation engineer remote latin america | 8 | 2 |
| AI agent developer remote worldwide | 7 | 3 |
| n8n automation engineer remote | 5 | 5 |
| AI integration engineer remote contract | 7 | 3 |
| AI chief of staff remote | 8 | 2 |
| AI executive assistant remote | 6 | 4 |
| AI operations lead remote startup | 9 | 1 |
| AI product manager remote latin america | 6 | 4 |
| chief AI officer remote startup | 9 | 1 |
| AI solutions consultant remote | 6 | 4 |
| head of AI remote startup | 5 | 5 |

- The 20 Sep swap is live: the generic "AI engineer founding team remote" / "founding engineer AI remote" are gone.
- 🚨 **29% of paid searches fail silently** — 46 of 160: 37 empty responses (`Expecting value`), 9 read timeouts
  (45 s). The run summary ("Done — new jobs: N") never mentions it. New jobs per run, last 10: 28, 25, 18, 30,
  26, 34, 38, 26, 41, 15.

## 2. Free sources — inside `vibejobhunter` (hourly; 23 cycles in the last 24 h)

Cycle of 27 Sep 17:32 UTC (journal `📊 SOURCE SUMMARY`):

| Source | Jobs | What it searches |
|---|---|---|
| ATS APIs | 2,691 | 114 Greenhouse + 37 Lever + 17 Workable + 68 Ashby company boards (40 per board type per cycle), e.g. xAI, GitLab, remote.com, Cohere, Perplexity, Ramp, Vanta, Zapier, Toptal, Turing, Make |
| Torre.ai (LATAM) | 591 | ~45 terms: ai automation, ai agents, workflow automation, n8n, zapier, prompt engineering, ai integration, no-code, head of ai, ai consultant, ai solutions architect, ai product manager, ai strategy, fractional cto, ai native, agent orchestration, agentic engineer, forward deployed, ai chief of staff, ai executive assistant, chief ai officer, ai program manager, ai transformation, ai enablement, director/vp of ai, gtm engineer, ai evaluation … |
| AI-Native-Builder | 269 | whole board (cache; "551 from cache, 0 newly fetched" every cycle in 24 h) |
| Get on Board | 172 | board feed |
| YC OSS (openings) | 141 | 1,651 YC companies across 7 tags → 120 active, hiring, remote/LATAM |
| Hacker News | 92 | "Who is hiring" thread, keyword filter: ai, ml, founding, engineer, startup |
| Dice MCP | 72 | ⚠️ AI Product Engineer, Applied LLM Engineer, Founding Engineer AI, AI Engineer Python, LLM Engineer, AI Agent Engineer, AI Developer Tools Engineer, Personal AI Engineer — **the generic engineer shapes cut on 20 Sep; this list was not updated** |
| RemoteOK | 64 | tags: ai, machine-learning, automation, no-code |
| WeWorkRemotely | 47 | categories: programming, full-stack, back-end, devops, ai, ml, automation, management-and-finance |
| Himalayas | 20 | global remote API |
| Remotive | 17 | 26 terms: AI automation, no-code, AI agent, AI solutions, prompt, AI automation engineer, AI agent developer, n8n, make.com, Zapier, workflow automation, AI integration engineer, AI implementation, forward deployed engineer, AI chief of staff, AI operations lead, AI executive assistant, AI personal assistant, AI product manager, chief AI officer, head of AI, AI consultant, AI program manager, AI transformation, solutions consultant |
| Wellfound · YC WAAS · AI-Jobs.net · BrightData LinkedIn | 0 | deliberate (NOW.md §7 DELIBERATE) |
| **Total** | **4,176** | → career gate passed **941 (22.5%)** → **4 new** (rest already seen) |

## 3. What decides a match — the lane registry (`src/core/target_lanes.py`)

8 lanes, 101 titles: AI Product & Program Management (14) · AI Solutions Architecture & Consulting (18) ·
AI Leadership & Transformation (16) · AI Automation & Operations (16) · AI-Augmented Builder / Integration (11) ·
GEO / AEO / AI Search Visibility (12) · AI-Qualified Executive Support (8) · Expert AI Evaluation & Training (6).

## 4. What reached HubSpot — last 7 days

157 `[HIRING-VJH*]` deals created: **3** in 🔥 I Act TODAY (AI Operations & Growth Lead @ Niuro · Technical Product
Manager – AI Finance App @ Bjakcareer · Staff Product Manager – Conversational AI @ Addi), **143** parked in
🤖 AI working, 7 in 💬 They replied, 4 No fit. The parked pile includes clearly off-target titles (Staff Software
Engineer AI Inference, Senior Engineering Manager Grafana Frontend, Senior Onchain Investigator @ Coinbase).

## 5. Findings to act on

1. **29% of paid searches fail silently** (Bright Data empty body / timeout) — no retry, no alert.
2. **Dice queries still target generic engineer roles** — the 20 Sep targeting change missed this list.
3. **🔒 The Telegram bot token is written to the journal** — httpx logs every `getUpdates` URL, ~8,500 lines/day,
   token included. Rotate the token (BotFather) and set httpx logging to WARNING.
4. ~20 off-target deals/day land in "AI working" — CRM clutter, not money.
