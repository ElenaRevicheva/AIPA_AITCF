# CTO AIPA — Claude Code Project Guide

Production AI orchestration service for [AIdeazz](https://aideazz.xyz). Single TypeScript Express process managed by PM2 on Oracle Cloud Ubuntu VM.

## Project layout

```
src/
  cto-aipa.ts          # Main entrypoint — Express server, cron jobs, model routing
  database.ts          # Oracle Autonomous DB (oracledb + mTLS wallet)
  telegram-bot.ts      # Telegram Grammy bot — CTO Q&A, lead digest
  atuona-creative-ai.ts# Creative co-founder Telegram bot (9k lines)
  lead-triage.ts       # Phase 5 lead scoring + HubSpot pipeline
  outreach.ts          # Email outreach (Hunter.io + Resend)
  hashnode-daily.ts    # Daily blog article publisher (Dev.to / Hashnode)
  sprint-briefing/     # Morning sprint briefing → Telegram voice note
  hubspot-client.ts    # CRM deal/contact writer (sourcePrefix convention)
  serpapi-prospects.ts # Google Search → new prospect discovery (every 6h)
  prospect-places.ts   # Google Places → local business leads
  brightdata-enrich.ts # LinkedIn + Crunchbase company enrichment
dist/                  # Compiled JS — never edit, always rebuild
docs/                  # Architecture and operational docs
```

## Build & run

```bash
npm run build          # tsc → dist/
npm start              # node dist/cto-aipa.js
npm run dev            # build + start (one-shot)
```

Production is PM2-managed (`ecosystem.config.js`). Never restart PM2 here — this container is ephemeral. Changes go through git → Oracle VM pull → `pm2 restart cto-aipa`.

## Model routing

| Task | Model | Override env var |
|------|-------|-----------------|
| Critical reviews (security/payment) | `claude-opus-4-7` | `CRITICAL_MODEL` |
| Ask CTO strategic Q&A | `claude-opus-4-7` | `STRATEGIC_MODEL` |
| Standard code reviews | `llama-3.3-70b-versatile` (Groq) | `STANDARD_MODEL` |
| Groq rate-limit fallback | `claude-haiku-4-5-20251001` | `CODE_REVIEW_FALLBACK_MODEL` |
| Blog articles | `claude-opus-4-7` | `HASHNODE_ARTICLE_MODEL` |

## Key cron jobs (all configurable via env)

| Schedule | Job | Env override |
|----------|-----|-------------|
| 14:30 Panama (UTC−5) | Daily blog post (Dev.to / Hashnode) | `HASHNODE_DAILY_CRON` |
| 14:00 UTC daily | Prospect ingestion (YC → Hunter → Oracle) | `INGEST_CRON` |
| 15:00 UTC daily | Outreach email cycle | `OUTREACH_CRON` |
| 08:00 UTC daily | Lead triage → Telegram digest | `TRIAGE_CRON` |
| Every 6h | SerpAPI prospect discovery | hardcoded |
| Configurable | Sprint briefing → Telegram voice | `SPRINT_BRIEFING_CRON` |

## HTTP endpoints (base: `https://webhook.aideazz.xyz/cto`)

```
GET  /                          Health check + status JSON
POST /webhook/github            GitHub webhook (PR/push reviews)
POST /ask-cto                   Strategic Q&A (Bearer OUTREACH_API_KEY)
GET  /leads/dashboard           Lead scoring dashboard
POST /leads/triage-run          Fire triage manually
GET  /outreach/stats            Outreach campaign metrics
POST /api/crm-event             HubSpot deal/contact upsert
POST /sprint-briefing/run       Fire sprint briefing manually
GET  /blog/posts                Blog post index (used by aideazz.xyz)
POST /marketing/inquiry         Contact form submissions
```

Auth: most write endpoints require `Authorization: Bearer $OUTREACH_API_KEY`.

## Required environment variables

Copy `.env.example` → `.env`. Minimum set to run:

```
ANTHROPIC_API_KEY      # Claude API
GROQ_API_KEY           # Groq (standard reviews + Whisper TTS)
GITHUB_TOKEN           # PR/commit access
TELEGRAM_BOT_TOKEN     # CTO bot
```

Oracle DB (`oracledb` + mTLS) requires `TNS_ADMIN=/path/to/wallet` and `ORACLE_*` vars — see `.env.example`. Without Oracle the service starts but memory/leads won't persist.

## TypeScript conventions

- Strict mode, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`
- `commonjs` modules, `esnext` target
- No test suite — build (`npm run build`) is the smoke-test
- `process.on('unhandledRejection')` and `uncaughtException` swallow errors to keep PM2 alive

## Oracle Cloud deployment path

Local → `git push origin main` → Oracle VM: `git pull && npm run build && pm2 restart cto-aipa`

Oracle VM paths are canonical — see `docs/oracle/ORACLE_ALL_PRODUCTS_RESILIENCE.md`.

## Remote Control usage

This repo is designed to be controlled via [Claude Code Remote Control](https://code.claude.com/docs). Typical remote workflow:

1. Open claude.ai/code or the Claude iOS/Android app
2. Connect to the CTO AIPA Claude Code session on your Oracle VM
3. Ask Claude to review a PR, fire a triage run, check lead stats, or update code
4. Changes are committed and pushed; Oracle VM is separately updated via git pull

Common remote tasks:
- `"Run a triage cycle and show me the lead brief"`  → triggers `POST /leads/triage-run`
- `"What's the outreach stats?"` → reads `GET /outreach/stats` via curl
- `"Update the blog article model to claude-sonnet-4-6"` → edits `AI_MODELS` or sets env var

## HubSpot sourcePrefix convention

All HubSpot deal/contact writers must set `sourcePrefix` so the dashboard can filter by agent. Format: `[AGENT_NAME]`. See `docs/HUBSPOT_NAMING.md`.
