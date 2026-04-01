# AILA — Three Inheritance Sources (CTO AIPA Analysis)

**Purpose:** Define what [AILA](https://github.com/ElenaRevicheva/AILA) (Adaptive Intelligent Life Assistant) should reuse vs. invent, based on code and docs in this ecosystem.

**Status:** Architecture analysis — not a build spec.

---

## 1. What AILA should inherit from **Atuona** (creative co-founder in `src/atuona-creative-ai.ts`)

Atuona is the closest existing implementation of **longitudinal, persona-stable, emotionally aware** behavior inside CTO AIPA.

| Pattern | Why AILA needs it | Notes |
|--------|-------------------|--------|
| **Persistent episodic state** (`atuona-state.json`, auto-save) | AILA’s thesis is continuity across months — same requirement | Generalize from book/NFT domain to life domains |
| **Emotional layer** (mood selection, tone-aware guidelines, emotional memory) | Maps to AILA’s emotional intelligence layer | Reuse the *idea*; life-assistant tone differs from literary voice |
| **Associative layer** (surprise domains, cross-domain links, avoidance of stale patterns) | Maps to associative recall / “connects dots” behavior | AILA should use **embeddings + DB**, not only curated domain lists |
| **Imaginative layer** (story/creative memory, character arcs) | Parallel to AILA’s bounded identity / transition work | Must stay **governed** (AILA’s “You Are One” / Judge — see section 3) |
| **Anti-repetition** (fingerprints, tracked metaphors, rotation) | Prevents “amnesiac chatbot” feel | Promote to first-class product concern for all channels |
| **Proactive behavior** (history of proactive messages) | AILA is meant to feel like a PA who notices | Define caps, consent, and quiet hours for a life product |
| **Multi-modal path** (voice, images where applicable) | Same user reality as AILA | Reuse infra patterns (e.g. Whisper → LLM), not Atuona’s art-only prompts |

**Bottom line:** Atuona proves the *shape* of AILA’s inner layers (emotional → associative → imaginative) can ship in production. AILA should treat Atuona as a **domain-specific predecessor**, not as the final memory or safety model.

---

## 2. What AILA should inherit from **CTO AIPA** (core service: `src/cto-aipa.ts`, `src/telegram-bot.ts`, `src/database.ts`)

CTO AIPA is the **technical spine**: reliability, integrations, and structured persistence.

| Pattern | Why AILA needs it | Notes |
|--------|-------------------|--------|
| **Deterministic gates before LLM** (security/complexity rules on reviews) | AILA still needs non-negotiable checks (e.g. crisis routing, policy, PII) | Translate “code rules” into “life-assistant policy rules” where appropriate |
| **Model routing by criticality** (Claude vs Groq, cost/latency tradeoffs) | Same economics at scale | AILA will likely use fast models for classification and frontier models for depth |
| **Oracle persistence** (mTLS, `aipa_memory`, conversation context, knowledge base) | Shared ecosystem memory — AILA should not invent a second DB story without a reason | New tables or namespaces for AILA-specific entities if kept separate from CTO memory |
| **Best-effort writes, resilient reads** | Keeps user-facing channels up when DB blips | Same discipline for AILA |
| **Operational posture** | Health endpoint, PM2, cron, deployment discipline | Any AILA service should follow the same [Oracle resilience playbook](../oracle/ORACLE_ALL_PRODUCTS_RESILIENCE.md) |
| **Telegram/Grammy patterns** | Channel parity | AILA may start Telegram-first like other agents |

**Bottom line:** CTO AIPA supplies **production craft** (routing, persistence, deployment). AILA should call into or mirror these patterns so the ecosystem stays one operable fleet.

---

## 3. What must be **new and unique to AILA alone**

These do not belong inside Atuona’s creative mandate or CTO AIPA’s technical mandate as primary responsibilities.

| Capability | Why it is unique to AILA |
|------------|---------------------------|
| **Life-wide memory model** | People, places, projects, finances, relocation, career — not only creative canon |
| **Entity store + semantic retrieval at scale** (e.g. PostgreSQL + pgvector, emotional charge per entity) | Atuona’s memory is narrative/creative; AILA’s is **user-life truth** with different integrity rules |
| **Judge-gated delivery** with explicit pass/rewrite and adversarial tests | Emotional safety as **architecture**, not only style — stricter than creative preference |
| **“You Are One” as enforced law** | Prevents identity-splitting / optimization framing — different from creative role-play |
| **Explicit-feedback-only evolution** | AILA’s docs require memory updates from validated user input — different default than “log everything” |
| **Cross-channel identity** (Telegram + WhatsApp + future) with one continuity graph | CTO/Atuona are bound to current product surfaces; AILA is the **unified PA** |
| **Hive-native agent graph** (if AILA ships on [Hive](https://github.com/aden-hive/hive) per AILA repo) | Different orchestration model from the monolithic TypeScript bots |
| **Privacy, consent, and data lifecycle** for a longitudinal life product | Higher bar than internal creative tooling |

**Bottom line:** AILA’s uniqueness is **governed longitudinal personal intelligence** — memory + safety + multi-domain continuity — not “another bot in the same repo.”

---

## Synthesis

- **From Atuona:** continuity mechanics, emotional/associative/imagination *structure*, anti-repetition, proactive cadence — the *felt* experience of a co-founder.
- **From CTO AIPA:** deterministic discipline, model routing, Oracle and deployment reality — the *ship and don’t die* layer.
- **Unique to AILA:** life-scale memory, Judge-enforced ethics, explicit evolution rules, and cross-channel PA identity — the *product*.

---

**Related docs**

- AILA product repo: [github.com/ElenaRevicheva/AILA](https://github.com/ElenaRevicheva/AILA) (`docs` branch: blueprint, Hive notes, symphony analysis).
- Oracle operations (all products): [ORACLE_ALL_PRODUCTS_RESILIENCE.md](../oracle/ORACLE_ALL_PRODUCTS_RESILIENCE.md).
