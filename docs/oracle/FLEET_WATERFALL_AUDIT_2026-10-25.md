# Fleet waterfall audit — 25 Oct 2026

**Question (Elena):** each agent is a diamond, but there is no more money or time to invest. Which model / voice
waterfall does each agent really run, proven from production logs — and what is the smallest surgical fix so it stays
alive and good with free resources?

**Budget assumed:** OpenAI = $0 (429 "no credits remaining" since 23 Oct 22:35 UTC). Claude API = $100 Max-plan grant
until 8 Nov, then $0 unless she tops up (she keeps a $20 Claude plan, which does not fund the API). Free tiers: Gemini,
Groq. Grok (xAI) answers today; its balance is unknown — do not count on it. Free voice: Microsoft Edge
(`scripts/speak-free.py`), Google gTTS. Free hearing: Groq Whisper.

**Method:** code read on Oracle (deployed copy = truth) + 72 h of production logs per agent; the decisive claim of
every report re-checked by hand (quoted below).

## Verdicts

| Agent | Verdict at $0 | Proof (prod, last 72 h) | Smallest fix |
|---|---|---|---|
| **PrepClaw** (OpenClaw) | 🟢 text · 🟡 voice | Opus answered 88, gpt-4.1 58 (until 23 Oct 22:35), Gemini 4 after OpenAI died; hearing = Groq Whisper first | TTS provider `openai` → `edge` (OpenAI fails first on every voice reply) |
| **VJH** | 🟡 | Pipeline runs (`LangGraph cycle done … errors=0`); Gemini 0.4 s / Groq 0.3 s live probe; `_speak_reply` = OpenAI tts-1 only → voice replies silently dead | OpenAI last in `llm_chain.py` + `llm_judge.py`; voice reply → existing free Edge; translation → existing chain |
| **CTO AIPA** core | 🟢 | Free mode (built today) verified: free → Gemini, claude → Claude; briefing speaks via Oracle free voice | none |
| CTO AIPA · Concierge / outreach | 🟢 | `draft written by claude in 3317ms`; self-test PASS 5 checks | optional: skip the direct OpenAI review call in free mode |
| CTO AIPA · Blog | 🟢 | 7× `Gemini (gemini-2.5-flash) returned … chars`, 0 Gemini failures | none |
| CTO AIPA · Atuona | 🟡 text · 🔴 images/video | 10× `claude-fable-5-1 stop=end_turn`; images/video paid-only (Replicate/Luma/Runway), none called | widen `shouldFallback` (401 / 5xx / timeout) at `atuona-creative-ai.ts:4371` |
| CTO AIPA · Podcast audio | 🔴 | `podcast-tts.ts` = OpenAI tts-1 only (no episodes ran) | route to existing free voice (`free-voice.ts`) |
| CTO AIPA · Reddit listener (Bright Data) | 🔴 waste | **369** BD-SERP timeouts, **533** × "returned 0 reddit threads", **0** threads found in 72 h (re-checked) | run every 6 h instead of hourly (`COMMUNITY_LISTENER_CRON`) or off |
| **Atlas / WHITESPACE** (client leads) | 🟡 | Last Monday run answered by OpenAI (Claude out of credit then); own chain claude → **openai** → gemini → grok → groq; next run Mon 26 Oct 14:00 UTC | drop the dead OpenAI leg (`~/whitespace/.env` key or `dist/llm.js:233`); breaker trips on any 400 (`llm.js:37`) |
| **Algom / DragonTrade** | 🔴 dead + waste | X API `402 credits depleted` on every post and poll (re-checked 20:10 UTC); 204,809 identical health lines in today's log (22 MB); Grok generates tweets that can never post | `pm2 stop dragontrade-main algom-poll algom-stream` until X credits exist (dashboard harmless) |
| **EspaLuz** Family (Telegram) | 🟡 | Claude answers replies; OpenAI-only steps fail every message: `Translation skipped - API error`, RAG embed 429, photo reading; Replicate hero-voice videos still spending | translation → existing `llm_chain` (gemini, groq, grok); OpenAI last in `llm_chain.py` |
| **EspaLuz** WhatsApp | 🔴 latent | idle since 16 Oct; on OpenAI failure translation returns `Spanish: [TRANSLATION NEEDED: …]` to the family (`espaluz_bridge.py:1892`, re-checked) | same translation swap; return nothing instead of the placeholder |
| EspaLuz Influencer | 🟢 | 3 promos posted (`AI generated story … ✅ sent`); chain gemini first | none |
| EspaLuz payments webhook | 🟢 | healthy, 0 restarts; no real payment calls in 30 days | none |
| n8n | 🟡 idle | 0 executions since 31 Aug; 520 MB RAM | none (check `/crm/webhook/ops` before stopping) |
| AW portal | 🟢 | $0, no traffic | none |

## Priority (her focus: get hired, get clients)

1. **Money focus** — VJH (voice, OpenAI out of the way), PrepClaw voice, Atlas before Monday's run.
2. **Stop waste** — Algom processes; Reddit listener frequency.
3. **Keep the diamonds honest** — EspaLuz translation (WhatsApp placeholder first), Atuona fallback, podcast voice.

Rules for every fix: existing code paths only, reorder or re-route to providers already in the fleet, back up first,
verify from logs after, reversible in one step. Nothing in this table is applied yet unless marked below.

## Applied 25 Oct ~20:35 UTC — priority 1 only (Elena: "just 1 for today; the other agents later")

- **VJH** `ae37052` + `f76117f`: OpenAI moved after Gemini/Groq/Grok in `llm_chain.py` (all 3 profiles) and
  `llm_judge._call_llm`; voice reply = free `speak-free.py` (Edge Ava) first, OpenAI second; translation through
  `llm_chain`. Proof on Oracle: live provider tests — Gemini, Groq, Grok, Claude return verdicts, chain tests pass,
  failover test (first three broken) passes; translation "¿Qué trabajos nuevos…?" → "What new AI Operations jobs are
  there for me this week?" in 0.6 s; free voice → 37 KB Ogg/Opus in 4.6 s. Service restarted 20:29:30, 0 restarts.
- **PrepClaw**: `messages.tts.provider` openai → edge (Ava); gateway restarted 20:31:10, Telegram + WhatsApp up.
- **Atlas**: `OPENAI_API_KEY` commented out in `~/whitespace/.env` (backup `~/_session-backups/model-tier-20261025/
  whitespace.env.bak`); pm2 restarted 20:31:51. Proof: text → claude in 1.4 s (Gemini after 8 Nov), embeddings → gemini
  in 0.2 s, no OpenAI attempt. Next run Mon 26 Oct 14:00 UTC.

**Bright Data is a paid, budgeted tool (~$15/month, Elena 25 Oct) — keep it.** The Reddit listener's zero yield is a
question of spending that budget well (her call later), not a reason to remove Bright Data.
