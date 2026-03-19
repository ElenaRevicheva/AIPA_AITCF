# PROJECT: EspaLuz – AI WhatsApp Spanish Tutor for Expat Families Across 19 Countries

**Live on WhatsApp:** https://wa.me/50766623757

---

## MOTIVATION

In 2022, I relocated from Russia to Panama with my young daughter and retired parents as a direct consequence of the war in Ukraine. I arrived without Spanish language skills, without time or budget for human tutors, and with full caregiving responsibilities in a new country.

My only real asset at that time was my professional background: 8+ years as a senior executive in high-tech public digital systems.

There was no grand vision initially — only an urgent need to rebuild a functional life for my family in a new country.

From that lived experience, EspaLuz was born — the first flagship MVP of AIdeazz, an ecosystem of emotionally intelligent AI assistants designed to evolve with people through real life transitions: migration, language learning, cultural adaptation, and personal development.

EspaLuz is emotionally intelligent — detecting homesickness, frustration, and language anxiety — but it also delivers practical language coaching and culturally contextual guidance across 21 Spanish-speaking countries, helping expat families navigate real-life situations such as healthcare, schools, banking, immigration, and daily communication.

---

## THE BUILD (Solo, 5 months, <$15K)

- **React/TypeScript SaaS** (~15K LOC, 70+ components, PayPal subscriptions)
- **WhatsApp bot** (~15K LOC Python, 50+ emotional states, sub-2s voice latency)
- **Telegram bot** (~2.9K LOC, real-time payment sync)
- **Integrated AI services:** Claude (primary), GPT-4 (fallback), OpenAI Whisper (transcription), gTTS + neural TTS, HeyGen, OCR
- **Cross-platform architecture:** Web + WhatsApp + Telegram with unified backend and **synchronized session memory** (PostgreSQL + **LangChain**)
- **Payment infrastructure:** PayPal subscription system
- **Production:** Deployed on Oracle Cloud Infrastructure (OCI) using Oracle Startup Credits, running alongside other AIdeazz systems; resilience automation (health checks, systemd, PM2) for 8 agents

---

## LANGCHAIN IN ESPALUZ WHATSAPP

EspaLuz is **designed** to use LangChain for persistent, cross-platform conversation memory so that the same user’s history is available whether they talk to the tutor on WhatsApp or Telegram. The integration is fully implemented in code; in production on Oracle, LangChain is **not currently active** because `langchain-postgres` / `langchain-community` are not in `requirements.txt`, so the app runs in “basic memory mode” and the conversation-persistence path is dormant. See `docs/espaluz/ESPALUZ_LANGCHAIN_HONEST_EVALUATION.md` for details and how to enable it or add a SQL fallback.

### What we use

- **`PostgresChatMessageHistory`** (from `langchain-postgres`, with fallback to `langchain_community.chat_message_histories.PostgresChatMessageHistory`) — stores every user/assistant turn in a PostgreSQL table (`chat_message_history`). Session identity is a deterministic UUID derived from platform + user id (`uuid5`), so WhatsApp and Telegram share the same logical session for one user.
- **`ConversationBufferWindowMemory`** (from `langchain.memory` / `langchain_core.memory`) — wraps the PostgreSQL-backed chat history with a sliding window (default `k=10`), so we pass only the last N turns into prompts while keeping full history in the DB. Uses `return_messages=True` and `memory_key="chat_history"` for integration with the rest of the pipeline.
- **Graceful fallback** — if LangChain or `langchain-postgres` is not installed, the bot falls back to a basic memory mode and still writes to the same PostgreSQL schema via direct `INSERT` so data stays consistent.

### How it’s wired in

1. **Unified memory module** (`espaluz_memory.py`): `EspaLuzMemory(platform='whatsapp', platform_user_id=user_id)` initializes the user and, when LangChain is available, sets `self._chat_history` via `get_conversation_memory(user_id)`, which returns the `PostgresChatMessageHistory` (optionally wrapped in `ConversationBufferWindowMemory`). Connection to PostgreSQL uses `psycopg` for LangChain and `psycopg2` for the rest of the app.
2. **After each Claude response** (voice and text flows in `espaluz_bridge.py`): we call `memory.chat_history.add_user_message(spanish_input)` and `memory.chat_history.add_ai_message(result['full_reply'])` so every turn is persisted through LangChain’s API into PostgreSQL.
3. **Context for Claude:** `get_recent_messages(user_id, limit=5)` reads from the same `chat_message_history` table and returns the last few turns so we can inject recent conversation into the Claude prompt. This keeps responses contextually aware across sessions and across platforms (WhatsApp/Telegram).

So in practice, **LangChain is used for production-grade, PostgreSQL-backed chat memory and sliding-window context** in a multi-platform, multi-country WhatsApp (and Telegram) tutor, with explicit handling of session identity and fallbacks when the LangChain stack is not installed.

---

## CHALLENGES

- **Multi-AI orchestration:** Routing between Claude (primary) and GPT-4 (fallback), handling failures, cost control, and keeping sub-2s latency for voice
- **Emotional intelligence layer:** Custom engine with **50+ emotional states** (e.g. `HOMESICKNESS`, `LANGUAGE_ANXIETY`, `CULTURAL_BREAKTHROUGH`, `FAMILY_RESILIENCE`) and dynamic tone/pacing adaptation
- **Cross-platform architecture:** One backend for web, WhatsApp, and Telegram with **synchronized session memory** via **LangChain + PostgreSQL**
- **International deployment:** Users in **19+ countries**, production on OCI with health checks and auto-restart for all agents
- **Full-stack ownership:** Design, build, deploy, and operate 50K+ lines of production code end-to-end

---

## SUCCESS METRICS

- Early-stage paying subscribers via PayPal
- Active usage across **19+ Spanish-speaking countries**
- **99%+ uptime** on OCI production (resilience automation in place)
- Built and operated on a lean budget (**&lt;$15K** total build cost)

(Currently in early traction, focused on retention and product iteration.)

---

## MY CONTRIBUTION (100% solo)

- Product vision and UX design
- **50,000+ lines** of production code (TypeScript, Python, SQL)
- System architecture and AI orchestration (Claude, GPT-4, Whisper, TTS)
- **Emotional-state detection system** (50+ states, expat-family specific)
- **LangChain integration** for PostgreSQL-backed conversation memory and cross-platform session sync (WhatsApp + Telegram)
- Payment integration and subscription logic (PayPal)
- DevOps (Docker, Oracle Cloud Infrastructure, monitoring, resilience scripts)
- Continuous user feedback and iteration
