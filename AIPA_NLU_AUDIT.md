# AIPA NLU & Intent Routing — Codebase Audit

**Date:** March 21, 2026  
**Scope:** Repository tree equivalent to `/home/ubuntu/cto-aipa` (`src/`, docs).  
**Purpose:** Record what exists for natural-language understanding, intent classification, and free-text routing — before deciding what to build vs complete.

**Related:** See `AIPA_ARCHITECTURE.md` for high-level architecture (note: architecture text can read like a unified NLU system; this doc aligns claims with actual code).

---

## 1. Prior session docs (AIPA_ARCHITECTURE.md & AIPA_UPGRADE_PLAN.md)

| Document | NLU-relevant content |
|----------|---------------------|
| **AIPA_ARCHITECTURE.md** | States `message:text` performs “natural language intent detection, auto-route to commands” and `message:voice` “detect intent, route accordingly.” That matches **observed behavior**, but the implementation is **mostly regex + heuristics**, with **Claude/Groq on the default Q&A path** — not a dedicated LLM intent classifier. |
| **AIPA_UPGRADE_PLAN.md** | Covers on-the-go Oracle ops (`/hoststatus`, `/logs`, `/restart`, etc.). **No NLU/intent content.** |

---

## 2. Existing intent classification logic

### 2.1 `src/telegram-bot.ts` (CTO Telegram bot)

| Mechanism | Implementation | Notes |
|-----------|------------------|--------|
| **`detectPersonalAIIntent(text)`** (~L6880+) | Heuristics: `includes`, `startsWith('/')`, `endsWith('?')`, phrase checks | Returns types: `idea`, `diary`, `task`, `research`, `question`, `command`, `conversation`. Comment: *“Quick pattern matching first (no AI needed)”*. **No second Claude stage.** |
| **JOB_SEARCH voice branch** (~L5691–5707) | Keyword match on transcription | Triggers: `vibejobhunter`, `vibe job hunter`, `job matcher`, `job matching`, `job search`, etc. → `handleJobSearchVoiceIntent`; sets `recentJobSearchVoice`. **Not LLM-based.** |
| **`handleQuestion` — “CURSOR-LIKE INTENT DETECTION”** (~L5883+) | Multiple **RegExp** blocks | Maps phrases → synthetic `/readfile`, `/editfile`, `/search`, `/createfile`, `/tree`, `/run`, `/fixerror`, `/explaincode`, `/refactor`, `/gentest`, `/diff` via **`bot.handleUpdate(...)`** with a fake message. |
| **Default branch of `handleQuestion`** (~L6101+) | **`askAI(prompt, …)`** | Large “Cursor twin” system prompt; **free-form answer**, not structured `{ intent, slots }` or tool routing. |

### 2.2 `src/atuona-creative-ai.ts` (Atuona bot, same Node process)

| Mechanism | Role |
|-----------|------|
| **`detectEmotionalTone`** + `EMOTIONAL_MARKERS` | Regex → tone buckets for **creative** replies — **not** CTO command routing. |
| **Knowledge entries with `triggers: /.../`** | Topic injection when text matches — **not** slash-command intent. |
| **`createContent`** | Claude + Groq fallback — **generation**, not intent classification for Telegram commands. |

### 2.3 `src/cto-aipa.ts`

- No intent / NLU logic (Express, webhooks, bot initialization).

---

## 3. Natural language → command mapping beyond regex

- **Beyond regex** in practice: the **default** path uses **`askAI`** to produce natural-language guidance (including suggested commands). The model does **not** reliably emit a **parsed** intent object or **invoke** handlers from structured output.
- **Automated routing** that actually **runs** commands is **regex-driven** (`handleQuestion` → synthetic slash + `bot.handleUpdate`).

---

## 4. `askAI()` and free-form messages

| Location | Behavior |
|----------|----------|
| **`askAI`** in `telegram-bot.ts` (~L313+) | Claude → Groq on billing/credit failure; used across commands, pending file edits, and **`handleQuestion` fallback**. |
| **`bot.on('message:text')`** | Non-commands: pending `/editfile`/`/createfile` flow uses **`askAI`**; otherwise **`handleQuestion`**. |
| **`createContent`** (`atuona-creative-ai.ts`) | Atuona creative flows only. |

---

## 5. Partial / asymmetric behavior

| Item | Status |
|------|--------|
| Personal AI intents (`idea`, `diary`, `task`, `research`) | Wired for **`message:voice`** only. **`message:text` does not call** `detectPersonalAIIntent` — typed phrases do **not** get the same auto-actions as voice. |
| **`handlePersonalAIAction(..., source: 'voice' \| 'text')`** | Signature allows `'text'`; **no text handler** passes `'text'` in current code paths (grep-verified). |
| JOB_SEARCH “planning mode” | **`recentJobSearchVoice`** (after voice keywords) blocks regex → `/readfile` / `/editfile` in **`handleQuestion`** for **5 minutes**. **`/project job` alone does not** apply that gate. |
| Architecture wording vs code | Risk of reading “intent detection” as one unified NLU stack; code is **three patterns**: regex router, voice heuristics, chat fallback. |

---

## 6. TODOs / disabled NLU code

- Repo grep on `TODO`/`FIXME` in `src/**/*.ts` did **not** surface NLU-specific TODOs (only incidental “TODO” in user-facing examples).
- No clearly commented-out Claude intent-classifier block identified in audited regions.
- `detectPersonalAIIntent` documents **no-AI** pattern matching — not a stub for a missing LLM stage in code.

---

## 7. Summary: exists vs partial vs missing

| Category | Content |
|----------|---------|
| **Exists** | Regex-heavy NL → slash command in **`handleQuestion`**; voice → Whisper → JOB keywords + **`detectPersonalAIIntent`**; **`askAI`** default chat; Atuona regex tone/knowledge + **`createContent`**. |
| **Partial** | Personal AI intents **voice-only**; JOB gating **voice-timestamp-only**; **`handlePersonalAIAction` text path unused**; architecture narrative vs implementation gap. |
| **Missing** | LLM **structured** intent classification (JSON / tools); **unified** text+voice intent pipeline; **`/project job`** as explicit gate for suppressing file/code auto-routing; function-calling layer for free text. |

---

## 8. Suggested direction (planning only)

Before new features: decide whether **typed** messages should reuse **`detectPersonalAIIntent`**, whether **`/project job`** should align with **`recentJobSearchVoice`** behavior, and whether a **new** LLM classifier **replaces** or **sits behind** regex (e.g. regex first, LLM on low confidence).

---

*This audit was produced from static code review; runtime behavior may vary by deployment and `.env`.*
