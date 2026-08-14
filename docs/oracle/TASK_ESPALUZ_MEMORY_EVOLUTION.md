# Task: Make EspaLuz emotional IQ + facts actually evolve (both bots)

**Status:** Ready to run in a **new** Cursor agent. Do not mix into the Aug 14 durable-store / RAG / analytics encodings chat.

**Repos:** `D:\aideazz\EspaLuzWhatsApp`, `D:\aideazz\EspaLuzFamilybot`  
**Ops hub:** `D:\aideazz\ai-cofounders\cto-aipa`  
**Oracle:** `ubuntu@170.9.242.90` — checkout **named `.py` files only**. Never `git pull`. Never touch runtime JSON (`user_sessions.json`, `paguelofacil_payments.json`, `family_memory_data/`, trials).

---

## Already proven (do not redo)

Aug 14 2026 production probe:

- LangChain + RAG persist and retrieve on both bots. History oldest **2026-01-20**. Not wiped by the encodings deploy.
- `emotional_history`: 174 rows, both platforms, through **11 Aug**. **165/174 are `neutral`.**
- `user_memories`: 13 rows. Elena WhatsApp (id 12) has **7 copies of `Test memory from unified system`**. Real family facts exist only for Telegram onboarding (Elena 13, Kira 15, unused Marina 14).
- Telegram vocabulary evolves (Elena 13 = 62 words). WhatsApp reply path does **not** call `add_vocab`.
- `family_members` table: **0 rows**. Family lives in JSON / a few memory strings.

Persistent **chat** memory works. This task is the remaining gap: emotion + durable facts into the next prompt.

---

## Defects to fix (exact)

### 1. WhatsApp `espaluz_enhancements.py` still has the bugs Telegram already fixed

Local WhatsApp copy still does:

```python
trend = memory_instance.get_emotional_trend(days=7)   # TypeError: missing user_id
memories = memory_instance.get_user_memories(limit=10)
ctx['slang'][:5]   # KeyError: slice(None, 5, None) when slang is a dict
```

Telegram `EspaLuzFamilybot/espaluz_enhancements.py` already:

- Passes `uid = getattr(memory_instance, "user_id", None)` into `get_emotional_trend` / `get_user_memories`
- Renders slang as dict items, not `[:5]` on a dict (Python 3.12)

**Port that Telegram file’s two fixes into WhatsApp.** Do not rewrite the module.

WhatsApp’s **main** tutor path uses `espaluz_personalization.py` (this one already passes `user_id`). The enhancements module still dies if that path is hit (country slang / 8-feature block). Resilience docs already noted `Enhancement error: slice(None, 5, None)` as non-fatal — make it actually work.

### 2. Telegram `espaluz_personalization.py` is the inverse bug

`EspaLuzFamilybot/espaluz_personalization.py` `get_emotional_context()` still calls:

```python
trend = self.memory.get_emotional_trend(days=7)
recent_messages = self.memory.get_recent_messages(limit=5)
```

WhatsApp’s copy of the same function **correctly** passes `user_id=self.user.id`. Copy that pattern into Familybot.

### 3. Stop serving test facts

Delete or never inject `memory_type='test'` / content `Test memory from unified system` for user 12. `get_context_for_prompt` currently puts those seven lines into Claude as “Key facts about this user.”

### 4. Write vocabulary on WhatsApp the way Telegram already does

In `EspaLuzFamilybot/main.py` after a reply, learned Spanish words go to `memory.add_vocab(...)`.  
`EspaLuzWhatsApp/espaluz_bridge.py` unified-memory block (~3626–3650) writes LangChain + RAG + `track_emotion` but **not** vocab. Add the same bounded write (`[:5]` words, non-fatal).

### 5. Extract a small set of durable facts from conversation (insert-only)

After each tutor reply (both bots), if the user clearly stated something durable, `store_user_memory` once:

**Allow:** preferred name, family member names/ages/roles, country/city, learning goal, Spanish level they claim, “I have a daughter named X”.

**Never store:** medical symptoms, payments, phone numbers, exact addresses, one-off mood, test strings.

Rules:

- Insert-only, skip duplicates (`ON CONFLICT DO NOTHING` already exists).
- Cap ~5 new facts per user per day.
- Prefer one-line facts: `Child: Alisa, age 4` not a paragraph.
- Do **not** invent an LLM fact-miner that runs on every token if a cheap regex/name detector plus existing `family_memory.extract_names_from_message` already covers names. Only add a model call if the cheap path is empty **and** the message is clearly a self-introduction / family / goal.

---

## Out of scope

- Do not change RAG threshold, LangChain session UUIDs, PagueloFacil durable mirror, JSON-guard timer, or analytics days-active.
- Do not “improve” emotion from `neutral` by swapping models unless the write path is proven first. 95% neutral is a later task.
- Do not wipe or restore JSON as a drill.
- Do not `git pull` on Oracle.

---

## Deploy

Canonical:

```text
WhatsApp:  git checkout origin/main -- espaluz_enhancements.py espaluz_bridge.py espaluz_personalization.py
           sudo systemctl restart espaluz-whatsapp
Telegram:  git checkout origin/main -- espaluz_enhancements.py espaluz_personalization.py main.py
           sudo systemctl restart espaluz-familybot
```

Health: WhatsApp `curl -sf http://127.0.0.1:8081/webhook`. Telegram `systemctl is-active espaluz-familybot`. Then a **read-only** probe:

- `get_emotional_trend(user_id, days=30)` returns a dict (not TypeError) for users 12, 8, 13.
- `get_user_memories(12)` no longer returns the seven test strings in the prompt context.
- `build_enhanced_context(...)` for Panama does **not** raise `KeyError: slice(None, 5, None)`.
- LangChain message counts still ≈ 194 / 98 / 52 / 14 for Elena WA 12, Marina 8, Elena TG 13, Kira 15 (must not drop).

---

## Done when

1. Both enhancement modules pass `user_id` and survive dict slang.
2. Telegram personalization passes `user_id`.
3. Test memories are gone from prompts.
4. WhatsApp vocab writes like Telegram.
5. At least one real non-test fact can be stored from a family/name sentence without storing medical text.
6. Production probe: chat history counts unchanged; new code imported by running bots; no RAG/LangChain errors in journalctl after restart.

Commit only the files you own. Leave unrelated dirty `deploy/*.sh` in Familybot untouched. Push product repos, then checkout-deploy. Document one short “Last Verified” note in `cto-aipa/docs/oracle/ORACLE_ALL_PRODUCTS_RESILIENCE.md`.
