# EspaLuz — one family memory across Telegram, WhatsApp and the web (plan, 31 Oct 2026)

**Status: PLAN — nothing built.** Elena asked "plan it" on 31 Oct. Build only after her go-ahead, phase by phase.

## Why (Elena's product, in one line)
EspaLuz is not an app the family goes to; it is a family tutor that follows them into real life on every channel.
The web app is that tutor's shared memory and the parents' window into it. A sentence Alisa learns in the web
classroom must be known to Pere on Telegram; a mission given on WhatsApp must be asked about on the web; the parent
report needs all of it.

## What is true today (measured 31 Oct, counts only)
Three separate memories, none of them complete:

| Store | Where | Who writes | Holds | Reads the others? |
|---|---|---|---|---|
| **Supabase** (`euyidvolwqmzijkfrplh`) | cloud | web app, classroom; Telegram since `7d26fc0` (only when linked) | 1 profile, 0 `connected_bots`, 0 `family_members`, 117 `learning_sessions` | no |
| **Unified memory** (Oracle Postgres, `DATABASE_URL_UNIFIED`) | Oracle, local | both bots via `espaluz_memory.py` (Jan 2026) | 26 users (4 Telegram, 22 WhatsApp, **0 on both**), 0 `family_members`, 109 vocabulary, 13 memories, 586 chat turns, 531 embeddings | bots only |
| **JSON files** on Oracle (`user_sessions.json`, `user_onboarding.json`) | Oracle, local | Family bot | onboarding, kids lesson state (turn, mission, stars) | no |

Plus: Family bot `DATABASE_URL` (5 `telegram_users`, trials, metrics) and WhatsApp `DATABASE_URL` are two more DBs
(different fingerprints). `espaluz_memory.py` is two copies that already differ (31 diff lines).

Gaps this creates:
- Web ⇄ bots: nothing flows back to the bots; the web never reads Telegram/WhatsApp memory.
- WhatsApp cannot be linked to the web at all (connect page makes Telegram codes only).
- Family members are recorded nowhere structured (0 rows in both `family_members` tables); the bot saves them as
  free-text memories.
- Kids lesson logic exists twice (bot `main.py` + `espaluz-chat`), changed by hand in step.
- 🔴 **Security:** `submit-progress` accepts the public anon key (it ships in the web bundle) plus any
  `platform_user_id`. Anyone could write progress into a linked family. A read endpoint built the same way would leak
  a child's data. Every bot ⇄ web call in this plan carries a server-only secret.

## The design
**Supabase is the family's record. Oracle stays the bots' working memory.**
- Supabase already has auth, RLS, `profiles`, `family_members`, and the web reads it directly; it is off the single
  Oracle box. The web never has to reach into Oracle.
- Oracle keeps what only the bots need and what is heavy: raw chat turns, embeddings (RAG), JSON session state.
- Between them flows a **small, typed set of family facts**, not chat logs:

```
family (= the parent's Supabase account)
 ├─ identities   telegram:<id>, whatsapp:<phone-hash>, web        (connected_bots, extended to whatsapp)
 ├─ members      Elena (parent, ru/en), Alisa (child 6, es+en), grandma…   (family_members, finally filled)
 └─ memory       one row per fact, per member:                     (NEW table family_memory)
       kind: said | learned | mission | mission_done | fact_about_me | lesson_summary | star
       e.g. Alisa · fact_about_me · "has a white cat (gata) called Luna" · from telegram
            Alisa · mission · "Di 'Te quiero mucho' a mamá" · from web · 30 Oct
```

Two server functions, both requiring `X-EspaLuz-Bot-Secret` (server-only, never in the web bundle):
- `family-memory-read` → given a platform identity, returns a **memory card**: the family's members and, for the
  member talking now, at most ~15 lines (last mission, sentences she can say, things she told us, last lesson step).
  The bot puts this card in the prompt, the same way the web classroom already sends `known` and `mission`.
- `family-memory-write` → appends facts after a turn (deduplicated, capped per member).

The web reads and writes `family_memory` directly under RLS (the parent sees only her family).

**Unlinked users keep working exactly as now** (local memory only). Linking upgrades them; nothing breaks for the
26 bot users who never opened the web.

## Phases (each one shippable, each one verified before the next)

**Phase 0 — prove today's link (5 min, Elena).** Web dashboard → Connect → new code → Telegram `/connect CODE`.
Done = `connected_bots` has 1 row and the next Telegram message appears in `learning_sessions` with `source=telegram`.

**Phase 1 — identity: one family, every door.**
- `connected_bots` takes `platform='whatsapp'`; WhatsApp bot accepts `connect CODE`; connect page lets the parent
  choose Telegram or WhatsApp.
- Bot → web calls switch from the anon key to the bot secret (fixes the security hole above for `submit-progress`
  and `connect-bot`).
- Done = Elena's Telegram and WhatsApp both resolve to her one family; a call without the secret gets 401.

**Phase 2 — family memory.**
- `family_memory` table + RLS; the two functions; `family_members` filled from bot onboarding and the web.
- Both bots: read the card at turn start, write facts after the reply (background thread, as in `7d26fc0`).
- Web classroom + chat: same card, same writes.
- Done = **the cross-surface test**: Alisa says "mi gata se llama Luna" in the web classroom → next Telegram kids
  turn, Pere uses Luna without being told; a mission given on Telegram is asked about in the next web hello.

**Phase 3 — one kids brain.** A single `kids-turn` function (lesson step, story, mission, sentence check, question
hold) called by the bot and the web; delete the twin code in `main.py` and `espaluz-chat`. Done = one place to change
the lesson, both surfaces show the change.

**Phase 4 — the parent report (the paid value).** After each kids lesson, from `family_memory`: 3 sentences she said,
1 to practise, tonight's mission — sent to the parent's own channel (Telegram/WhatsApp) in the parent's language
(incl. Russian), and shown on the dashboard. Built deterministically from stored facts, not re-told by a model.
Done = Elena receives a correct report after a real lesson with Alisa.

## What it costs
- Money: $0 (Supabase free tier; no new model calls — the card and the report are assembled from stored facts).
- Elena's clicks: approve each Supabase deploy in chat; Lovable **Publish → Update** after the web phases (1, 2, 4).
- Oracle: two bot restarts per phase, check-then-copy deploys as usual.

## Risks and rules
- **Child data.** Facts about Alisa stay inside her family's row (RLS), never in logs at full length, never public.
  The card never contains contact details. Same safety rules as the Kids plan §4.
- **Lovable redeploys functions with `verify_jwt=false`** unless `supabase/config.toml` names them — pin the new
  functions there before the first Publish.
- **Two copies of `espaluz_memory.py`** already differ; Phase 2 touches only the new card/write calls, not that module.
- Oracle unified DB is local to one box: Phase 2 makes Supabase the durable record, which also covers that risk.

## Decided / open
- Default (unless Elena says otherwise): **family = the parent's web account**; a child has no login of her own.
- Open for Elena: should a bot-only user be offered a web account from inside the bot (a sign-up link that arrives
  already linked)? Not in Phases 0–4.

## Housekeeping found while planning
`aideazz-private-docs` keeps `docs/plans/` (incl. the Kids/Buddy plan) on branch `docs`, which is 402 commits ahead
of / 51 behind `main` (the default). Plans there are invisible to anything reading `main`. That is why this plan lives here.
