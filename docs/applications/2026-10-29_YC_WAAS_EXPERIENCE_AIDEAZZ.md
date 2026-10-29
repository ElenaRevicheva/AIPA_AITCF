# Work at a Startup (YC) — experience entry, actualised 29 Oct 2026

Paste-ready replacement for the AIdeazz entry in the Work Experience field. Every number below is
verified in this repo or on Oracle on 29 Oct 2026 (sources at the bottom). Companion file:
`WAAS_PROFILE_PASTE_READY.md` (29 Aug) for the other fields.

**Removed on purpose:** the "AI Co-Founder Systems" / "Executive AI seats" taglines. Employer-facing copy
never foregrounds the startup or "co-founder" framing (Elena's rule, 23 Oct 2026, memory
`feedback_job_deliverables_no_startup_signal`). The company name stays because this IS the work
entry; the framing is "I own production", not "my company".

---

## Paste this

```
AIdeazz AI Lab — Founder & AI Systems Engineer · 2025–present · Panama, remote

Founder-led AI lab running 10 production AI agents 24/7 on one Oracle Cloud VM plus AWS Lambda.
They cover language learning and relocation (EspaLuz on WhatsApp, Telegram and web), a technical
assistant that reviews code and runs a fractional-CTO desk, AI marketing and CRM, an autonomous
job-search pipeline, a self-hosted interview coach, voice-to-task tooling, and Atuona AI Film Studio.

I design, build, deploy and operate all of it solo as an AI-augmented engineer (Claude Code, Cursor).
I own the architecture, implementation, evals, production reliability and the final judgment call:
AI proposes, a human decides, every number is checked against logs.

What is live in production:

* Resilient LLM layer: every model call runs a free-first, multi-provider fallback (Groq, Gemini,
  Anthropic, OpenAI, xAI, DeepSeek), ordered per use case. When OpenAI credits ran out (23 Oct 2026)
  and the Anthropic org hit its monthly cap (28 Oct), the fleet kept serving; when Groq's per-model
  daily token limit tripped, a six-model Groq waterfall took over. Voice has the same shape: Groq
  Whisper first for hearing, free Microsoft Edge TTS as the fallback for speaking.
* Multi-agent orchestration: LangGraph 7-node state graph with SQLite checkpointing (job pipeline),
  structured system prompts, persistent state, autonomous tool-use loops, Telegram / WhatsApp / HTTP
  interfaces, human-in-the-loop on anything that sends or spends.
* RAG and memory: two-layer memory in EspaLuz — LangChain Postgres chat history plus pgvector
  retrieval (text-embedding-3-small, cosine search, 0.75 similarity floor, top-k 3) injected before
  each model call.
* Multimodal pipelines: multilingual voice, text and image; Whisper transcription; per-character TTS
  voices (MiniMax on Replicate) for a kids' Spanish classroom on web (Supabase edge functions) and
  Telegram.
* Single source of truth for users: an hourly truth layer reads every store (Telegram, WhatsApp,
  web, PayPal API) and writes one verified table; "paying" means a live payment-provider record,
  nothing else. Nightly Postgres dumps.
* CRM and operations: HubSpot automation (attributed deals, dedup, pipeline routing, files attached
  to the deal) and, since Oct 2026, my own CRM on Oracle Autonomous Database growing beside HubSpot
  (strangler-fig migration, one data type per step), with a web face and an n8n ops feed reading it.
* Job-search automation: ATS sweeps (incl. Ashby boards), scoring, and an apply kit per deal —
  company brief, role defense, posting-shaped CV, cover letter — written to HubSpot and audited
  column by column.
* GEO / AEO / Tech-SEO: an AI Visibility Audit API (34 evidence-backed checks in 4 categories,
  per-engine crawlability verdicts for GPTBot, ClaudeBot, PerplexityBot and others, $0 per call,
  public docs page, weekly self-audit CI); a bilingual daily blog publisher with a token-overlap
  duplicate gate, a grounding gate that refuses unsourced numbers (fail-closed, deterministic
  fallback article), buyer-question mode driven by a measured AI-citation baseline (22 prompts across
  Perplexity, ChatGPT and Google AI Mode), Dev.to canonical cross-posting and UTM attribution.
* Public postmortems: an AI Ops Wiki generated from Markdown front-matter (a dead concept link fails
  the build), fed after every production incident — aideazz.xyz/ai-ops-wiki.html.
* Executive assistant: an AWS Lambda briefing agent (EventBridge cron) that reads repository context
  and voice notes and delivers a daily audio briefing to Telegram; voice-to-Trello that edits the
  existing card instead of creating a duplicate (idempotent writes).
* Evals and deploy discipline: a 127-test harness (unit, integration, golden set) run on the
  production box before every deploy; a deploy counts only when the compiled file's md5 matches the
  commit, the process start time is newer than the file, and the log shows a result line.
* AI filmmaking: Atuona AI Film Studio — Luma, Runway, Veo, Kling and Seedance behind a
  provider-fallback chain, an FFmpeg compiler that assembles finished poetry films, published at
  atuona.xyz/aifilmstudio.
* Infrastructure: Oracle Cloud Always Free tier + AWS Lambda; PM2 / systemd, a 5-minute health cron
  with auto-restart and keep-alive; infrastructure cost about $2/month.

Stack: TypeScript, Node.js, Python, FastAPI, Flask, React/Vite, Supabase (Postgres, edge functions),
PostgreSQL + pgvector, Oracle Autonomous Database, SQLite, LangGraph, LangChain, FFmpeg, nginx,
Anthropic / OpenAI / Google / Groq / xAI APIs, Replicate, HubSpot API, n8n, AWS (Lambda,
EventBridge), Oracle Cloud.
```

---

## What changed against the 28 Oct draft, and the source for each

| Claim | Was | Now | Source |
|---|---|---|---|
| Agent count | 9 | 10 (9 on Oracle + Sprinter on Lambda) | memory `reference_oracle_resilience_doc` fleet table; `docs/oracle/FLEET_WATERFALL_AUDIT_2026-10-25.md` |
| Provider list | Claude, GPT, Gemini, Groq, Grok | + DeepSeek, free-first order rule | NOW.md 28 Oct wallet table; fleet audit |
| Fallback proof | generic | OpenAI out 23 Oct 22:35 UTC; Anthropic cap 28 Oct; Groq TPD 429 → six-model waterfall (`espaluz-chat` v201) | memory `project_openai_single_point_20261023`; NOW.md 28 Oct 23:41 |
| Voice fallback | not mentioned | Groq Whisper first; Edge TTS free fallback; Lambda speaks via Oracle | same + `src/free-voice.ts`, `scripts/speak-free.py` (commit 45f792e2) |
| RAG | not mentioned | pgvector + LangChain two-layer memory, 0.75 floor, top-k 3 | memory `project_career_focus` (verified in `espaluz_rag.py`, 11 Aug) |
| LangGraph | not mentioned | 7-node StateGraph, SQLite checkpointer | memory `project_aideazz_ecosystem` |
| Kids classroom / MiniMax voices | not mentioned | web (Supabase `generate-voice` v202) + Telegram | NOW.md 28 Oct |
| Truth layer | not mentioned | `truth_people`, hourly, payment-verified | memory `project_own_crm_parallel_to_hubspot` (29 Oct) |
| Own CRM | not mentioned | Oracle Autonomous DB beside HubSpot, face live, n8n reads it | same; commits c8a52f2b, 0be1f99e |
| Apply kit / Ashby | not mentioned | brief, defense, CV, letter → HubSpot | CLAUDE.md standing rule; memory `project_scale_army_ashby_board` |
| Visibility API | not mentioned | 34 checks / 4 categories / $0 per call / weekly CI | memory `project_visibility_api`; `src/visibility-audit.ts` |
| Blog gates | "daily automated publishing" | token-overlap dedup, grounding gate, deterministic fallback, buyer-question mode (22-prompt baseline) | CLAUDE.md 25–26 Aug; memory `project_blog_buyer_question_mode` (28 Oct) |
| AI Ops Wiki | not mentioned | generated from Markdown, build fails on dead link | memory `project_ai_ops_wiki` |
| Voice→Trello idempotency | not mentioned | add-to-existing-card | commits da87383d, 863bc09c |
| Eval count | not mentioned | 127/127 on Oracle | commit 863bc09c (29 Oct) |
| Film providers | Luma, Runway, Veo, Kling | + Seedance | NOW.md 28 Oct wallet table |
| Cost | ~$2/month | kept (Elena's figure; not re-verified from bills) | — |

**Not claimed, deliberately:** paying EspaLuz subscribers (truth layer 29 Oct: 0 paying customers);
X/Twitter automation (X API 402 since 25 Oct); the podcast (in progress today).
