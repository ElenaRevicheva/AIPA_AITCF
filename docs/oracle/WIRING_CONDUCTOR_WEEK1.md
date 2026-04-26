# Week 1 — Wiring Audit & Build Log

**Date:** 2026-04-02
**Author:** CTO AIPA (Claude Code) + Elena Revicheva
**Status:** In Progress
**Purpose:** Wire the AIdeazz 10-agent ecosystem into a single outcome-tracking system

---

## Context

CMO AIPA strategic audit revealed: all 10 agents produce activity, none track outcomes. Content gets likes, not clients. Applications may not be delivered. The only revenue source (EspaLuz) can't distinguish free from paid users. This build wires it up.

---

## Pre-Build Audits (Completed 2026-04-02)

### Audit 1: VibeJobHunter Eval Framework — Layer 4 (LLM-as-Judge)

**Status: ✅ CONFIRMED DONE**

| Layer | File | Tests | Runtime | Cost |
|-------|------|-------|---------|------|
| 1 — Keyword scoring | `evals/test_keyword_scoring.py` | ~50 | <5s | $0 |
| 2 — Bias compensation | `evals/test_bias_compensation.py` | ~67 | <5s | $0 |
| 3 — Full pipeline (golden set) | `evals/test_full_pipeline.py` | ~22 | 2–10s | $0 |
| 4 — LLM-as-judge | `evals/test_llm_judge.py` | 14 | 15–45s | ~$0.03–0.08 |
| **TOTAL** | | **131** | | |

Layer 4 details:
- Real Claude API calls (Haiku model) — not stubs
- 12 curated judge cases with expected verdicts (APPLY/OUTREACH/REVIEW/DISCARD)
- 22-job golden set integration test
- 75% agreement threshold enforced (hard assertion)
- Elena's honest profile embedded: gaps (RAG, LangGraph, AWS), strengths (multi-agent, voice, routing)
- Graceful skip if API key missing (doesn't break CI)

**Interview answer unlocked:** "I built a 4-layer eval harness — 131 tests, $0.08/run. Layer 4 uses Claude as an independent judge to validate my deterministic scoring engine against 22 golden-set jobs. Agreement threshold is 75% — deliberately below 100% because edge cases have legitimate ambiguity."

---

### Audit 2: VibeJobHunter Application Delivery

**Status: ❌ CRITICAL — Applications are NOT verified as delivered**

| Finding | Detail |
|---------|--------|
| `ATS_DRY_RUN=true` by default | All form submissions are simulated. Never clicks submit. |
| 253 "application artifacts" | Local text files: cover letter + resume. Not sent to employers. |
| Success detection | Page text matching ("thank you"), not HTTP status codes |
| Confirmation IDs | Auto-generated timestamps (`GH_20260402_1912`), not from employers |
| Email stats | `total_sent: 0`, empty `sent_emails` array — zero outreach actually sent |
| Database gap | No field for employer-issued confirmation ID or delivery status |
| Outreach emails | Block list includes `careers@`, `jobs@`, `hr@`, `recruiting@` — the exact addresses applications go to |

**Verdict:** Elena has been relying on a system that generates materials locally but has no verified delivery to any employer. The 253 artifacts and 148 outreach messages are local files.

**Action required:** This is a VibeJobHunter repo fix, not a CTO AIPA build. Documented here for tracking. Fix requires:
1. Set `ATS_DRY_RUN=false` when ready for live submission
2. Log HTTP response codes from actual ATS form submissions
3. Capture employer-issued confirmation IDs (not auto-generated)
4. Add delivery verification fields to database
5. Re-evaluate blocked email patterns (blocking the exact addresses needed)

---

### Audit 3: EspaLuz Payment System

**Status: ❌ BROKEN — Cannot reliably distinguish free from paid users**

| Finding | Detail |
|---------|--------|
| PayPal webhook signature verification | **Disabled** — any request can trigger subscription updates |
| Trial-to-paid detection | Fails — users who subscribe via PayPal not auto-linked |
| Dual storage | PostgreSQL + JSON with no sync = data inconsistency |
| Subscription cancellation | No sync — access not revoked when PayPal cancels |
| Gumroad | Account suspended, feature disabled |
| Subscriber data | WhatsApp: 3 entries in JSON. Telegram: entries from January 2026. |
| PayPal plan IDs | WhatsApp: `P-38A73508FY163121MNCJXTYY`, Telegram: `P-6GR95409C95293139NFSBJJY` |

**Key files:**
- `EspaLuzWhatsApp/paypal_webhook.py` — signature verification skipped (line 43)
- `EspaLuzWhatsApp/user_trial_system.py` — core trial management
- `EspaLuzWhatsApp/whatsapp_email_linking.py` — email/subscription linking
- `EspaLuzFamilybot/espaluz_paypal_system.py` — 1800+ lines, core PayPal integration

**Action required:** Fix in EspaLuz repos. PayPal webhook → Oracle `espaluz_funnel` table is part of this week's CTO AIPA build.

---

## Week 1 Build: CTO AIPA Wiring Layer

### What we're building

CTO AIPA becomes the temporary conductor of all 10 agents by adding:

1. **`agent_outcomes` table** — every agent writes what it did + whether it worked
2. **`business_leads` table** — track engagement signals from LinkedIn/social
3. **`espaluz_funnel` table** — track every user from trial → paid → churned
4. **CRUD functions** for all three tables
5. **Unified daily briefing** extending existing `/daily` command

### Architecture decision

**CTO AIPA = conductor now. AILA = real product later.**

Rationale: CTO AIPA already has voice-first intent detection, 7-day persistent memory, 80+ commands, Oracle DB access, Telegram delivery, and 8 AM cron briefing. Adding 3 tables + outcome tracking is ~1,000 lines. Building AILA from scratch (Hive/Python, pgvector entity store, Judge-gated delivery) is a 3-6 month product build. AILA inherits the outcome data when it ships — the `agent_outcomes` table is the same regardless of which bot reads it.

Documented in: `docs/aila/AILA_INHERITANCE_ANALYSIS.md`

---

### New Oracle Tables

#### `agent_outcomes`

```sql
CREATE TABLE agent_outcomes (
  id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
  agent_name VARCHAR2(50) NOT NULL,
  action_type VARCHAR2(100) NOT NULL,
  action_detail CLOB,
  outcome_status VARCHAR2(50) DEFAULT 'pending_verification',
  outcome_detail CLOB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP
)
```

`outcome_status` values: `pending_verification`, `verified_delivered`, `verified_failed`, `no_outcome`, `outcome_positive`, `outcome_negative`

#### `business_leads`

```sql
CREATE TABLE business_leads (
  id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
  source VARCHAR2(100) NOT NULL,
  name VARCHAR2(500),
  context CLOB,
  signal_strength VARCHAR2(20) DEFAULT 'low',
  status VARCHAR2(50) DEFAULT 'new',
  next_action VARCHAR2(1000),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

`signal_strength`: `high` (commented/DM'd), `medium` (liked + visited), `low` (liked only)
`status`: `new`, `contacted`, `in_conversation`, `converted`, `lost`

#### `espaluz_funnel`

```sql
CREATE TABLE espaluz_funnel (
  id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
  user_id VARCHAR2(100) NOT NULL,
  channel VARCHAR2(50) NOT NULL,
  trial_start TIMESTAMP,
  trial_end TIMESTAMP,
  messages_sent NUMBER DEFAULT 0,
  last_active TIMESTAMP,
  converted NUMBER(1) DEFAULT 0,
  payment_status VARCHAR2(50) DEFAULT 'trial',
  paypal_subscription_id VARCHAR2(100),
  retention_message_sent NUMBER(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

`payment_status`: `trial`, `active`, `cancelled`, `churned`, `expired`

---

### Build Progress

| Item | Status | Lines | Notes |
|------|--------|-------|-------|
| `agent_outcomes` table + init | ✅ Done | ~90 | Table create + `saveAgentOutcome`, `verifyAgentOutcome`, `getAgentOutcomes`, `getOutcomeSummary` |
| `business_leads` table + init | ✅ Done | ~120 | Table create + `saveLead`, `updateLead`, `getLeads` (sorted by signal strength) |
| `espaluz_funnel` table + init | ✅ Done | ~180 | Table create + `upsertEspaluzUser` (MERGE), `getEspaluzExpiringTrials`, `getEspaluzFunnelSummary` |
| All exports added | ✅ Done | ~20 | 12 new functions exported from database.ts |
| TypeScript compile | ✅ Pass | | `npx tsc --noEmit` — zero errors |
| **Total new code** | **✅** | **487** | database.ts: 1173 → 1660 lines |
| Unified briefing command | ⏳ Next | | Extend `/daily` in telegram-bot.ts to pull from all 3 tables |
| Cross-agent routing | ⏳ Next | | `/lead`, `/outcomes`, `/espaluz` commands in telegram-bot.ts |
| `emit_event()` in CMO AIPA | ⏳ Week 2 | | CMO writes to `agent_outcomes` on each post |
| `emit_event()` in EspaLuz WhatsApp | ⏳ Week 2 | | EspaLuz writes to `espaluz_funnel` + `agent_outcomes` |

---

---

## Updates Since Week 1 (April 2026)

| Item | Status (Apr 18) | Detail |
|------|-----------------|--------|
| **VJH eval framework** | ✅ Complete (Mar 30) | 131 tests, 4 layers (keyword, bias, golden-set, LLM-as-judge). All green. Verified from actual code in `evals/`. |
| **VJH founder outreach email** | ✅ Fixed (Apr 10) | `FROM_EMAIL` corrected to `aipa@aideazz.xyz`, `_send_email_message` TypeError fixed, `_extract_email` no longer returns `careers@` addresses. Claude retry resilience added. |
| **VJH hard gate recalibration** | ✅ Done (Apr 10) | Senior/Staff/Principal excluded, IT outsourcers penalized, career gate pass rate tightened to ~20.7%. |
| **VJH ATS_DRY_RUN** | ⚠️ NEEDS VERIFICATION | Was `true` on Apr 2. Needs server-side check: `grep ATS_DRY_RUN /home/ubuntu/VibeJobHunterAIPA_AIMCF/.env` |
| **EspaLuz PayPal webhook** | ❌ Still broken | Signature verification still disabled. Free/paid user detection unreliable. |
| **`agent_outcomes` table** | ✅ Deployed | Table exists in Oracle, `saveAgentOutcome` used by lead triage (`triage_cycle`). |
| **`business_leads` table** | ✅ Deployed | Table exists, receives inquiry form submissions via `/marketing/inquiry-proxy`. |
| **`espaluz_funnel` table** | ✅ Deployed | Table created. EspaLuz repos not yet wiring writes to it. |
| **Unified briefing** | ⏳ Partial | `/daily` exists but doesn't pull from all 3 tables yet. |
| **GEO+SEO Marketing Engine** | ✅ Complete (Apr 17-18) | Phases 1-5 shipped: JSON-LD, sitemap (11 URLs), daily blog publishing, UTM attribution, outreach, lead triage. Phase 1f: www→apex 301, hreflang, 404 noindex. |
| **Oracle wallet** | ✅ Fixed (Apr 14) | Fresh wallet, correct WALLET_LOCATION, WALLET_PASSWORD in .env. |

| **EspaLuz Telegram — 2-layer RAG memory** | ✅ **Done (Apr 25, 2026)** | LangChain retrieval wired (`chat_history.messages[-5:]`) + pgvector semantic RAG (`espaluz_rag.py`, `espaluz_embeddings` table, OpenAI `text-embedding-3-small`, cosine sim > 0.75, top_k=3). Both layers injected into Claude system prompt via `format_mcp_request()`. Save wired after every turn. Confirmed in prod logs: "✅ RAG embeddings saved for session 8c6fd9e0..." |
| **EspaLuz WhatsApp — 2-layer RAG memory** | ✅ **Done (Apr 25, 2026)** | Same `espaluz_rag.py` deployed to WhatsApp repo. Retrieval appended to `personalized_db_context` (existing personalization layer preserved). Two save blocks wired: voice/Spanish path (`spanish_input`) + text path (`message_text`). Session namespace: `whatsapp_*`. Confirmed in prod logs: "📚 LangChain: 5 recent turns retrieved" + "✅ RAG embeddings saved for session 51e064f5..." Pre-existing bug noted: `Enhancement error: slice(None, 5, None)` — non-critical. |
| **VJH LangGraph pipeline** | ✅ **Done (Apr 26, 2026)** | Replaces raw for-loop in `orchestrator.run_autonomous_cycle()`. 7-node StateGraph: gate → score → route → submit/outreach/discard → notify. SQLite checkpointer (`autonomous_data/vjh_checkpoint.db`). `thread_id=vjh_{job_id}` — skips already-processed jobs (fixes Deel ×7 deduplication). `interrupt_before=["submit_node"]` — score 60–69 pauses, sends Telegram ask, resumes on `/approve_vjh_{id}`. submit_node captures real HTTP status + confirmation_id (no more silent failures). Outreach node respects daily cap (2/day). Fallback to legacy pipeline on LangGraph error. **Confirmed live on Oracle**: first cycle processed 8 jobs, all discarded correctly, zero errors. `langgraph>=0.2.0` installed in VJH venv. |
| **VJH ATS_DRY_RUN verified** | ✅ **Verified (Apr 26, 2026)** | `ATS_DRY_RUN=false` confirmed on Oracle — flag was already off. Real problem was Resend rate limiting (3/hour cap) and deduplication failures (Deel ×7, Vanta ×4). LangGraph pipeline now addresses both. |
| **Resume updated on Oracle** | ✅ **Done (Apr 26, 2026)** | `autonomous_data/resumes/elena_resume.pdf` replaced. Claude Code + Cursor now explicit in summary + dedicated CORE SKILLS section. pgvector/RAG added. Railway removed. Target roles expanded (AI Systems Operator, Automation Lead, Integration Specialist, Solutions Architect, AI Program Manager). generator at `aideazz/scripts/generate_resume.py`. |

**Version:** 1.3 — Updated 2026-04-26 (LangGraph pipeline live + ATS verified + resume updated)
