# EspaLuz Telegram (EspaLuzFamilybot) — built but unreachable (3 Nov 2026, read-only)

Checked at git `5427a06`; every live `.py` on Oracle = git HEAD by md5. Only on Oracle: one-off `fix_sub.py`,
`restore_sub.py`, runtime json, `.bak` copies — no feature code. Errors in last 3 days: **0** (27 `utcnow()`
deprecation warnings only). Loops deliver: 7 parent reports, 2 kids daily rituals, 1 weekly recap sent.
Already wired 2 Nov (not repeated): /org, /feedback, /invite, weekly recap, /pagar passes, kids thin client.

## 1. Built, not connected
| Feature | Evidence | User gets | Fix | Risk |
|---|---|---|---|---|
| **/review word practice** | `/menu` advertises it (`espaluz_menu.py:63,170`), no handler. `get_words_for_review` (`espaluz_memory.py:679`) + `record_vocabulary_review` SRS (`:692`) no caller. DB: 109 words, 109 due, 0 reviewed. ⚠️ 108/109 have translation = the word (`main.py:4454` `add_vocab(word, word, …)`) → build cards from session `learned`/`needs_review` (`main.py:2270-2287`) or a model gloss | daily "do you remember?" | ~40 lines | low |
| **/help_immigration, /help_housing** | `REAL_LIFE_SITUATIONS` has both (`espaluz_country_contexts.py:1105,1219`); `get_situation_phrases` (imported `main.py:45`) + `get_urgent_phrases` (`:1303`) never called; `/help_*` covers only banking/medical/school/shopping/transport/emergency (`main.py:4887-4939`) | the two first relocation tasks | 2 handlers ~30 lines | low |
| **/culture country guide** | advertised (`espaluz_menu.py:97,173`), no handler; `get_country_scenarios` (`espaluz_country_contexts.py:1258`) no caller. Panama data: Migración, visa types, hospitals, CSS, schools, taxi apps (`:95-140`) | local guide by /country | ~25 lines | low; data thin outside Panama |
| **Day-7 / day-30 feedback prompts** | `TESTIMONIAL_7_DAY`/`_30_DAY` imported (`main.py:65-66`), `get_testimonial_prompt` (`espaluz_menu.py:627`) unused; `payment_reminder_loop` (`main.py:3794`) already walks trial users every 10 min | testimonials collected automatically | ~15 lines + sent-once file | low |
| /demo | flag saved, no path checks `is_demo_active`; `get_demo_response_wrapper` (`espaluz_demo_mode.py:124`) etc. unused | workshop "behind the scenes" view | ~10 lines | medium (changes replies) |
| Daily analytics | `record_daily_analytics` (`espaluz_memory.py:832`) no caller; table 0 rows | owner metrics | 3 lines | low |
| scheduled_messages | table exists on Oracle, 0 rows, no code | — | new work | — |
| relocation_milestones | no table, no code | — | new work | — |
| `espaluz_personalization.py`, `espaluz_admin.py` | duplicate of wired enhancements / Flask app nothing runs | — | skip | — |

## 2. Wired but broken
- 🔴 **Customer emails printed to the log on every restart**: "TEMP DEBUG" dumps `subscribers.json` (`main.py:6997-7002`), 20 restarts so far. Fix = delete 5 lines. (Log rotation/cleanup of past lines = Elena's call; never wipe without her OK.)
- **Family context likely always empty**: `family_members` 0 rows, `users.family_id` empty for all 26 users while 6 "family" memories exist; `add_family` path (`main.py:278,285`) writes nothing → FAMILY CONTEXT block (`espaluz_enhancements.py:629`) never fires. Reproduce before fixing.
- **/menu breaks its own links**: `MENU_TEXT.replace('_',' ')` (`main.py:5351`) turns `/help_banking` into "/help banking".
- Advertised, no handler: `/review`, `/culture`, `/demo_off` (`espaluz_menu.py:588`).

## 3. BotFather menu (14 live): start, menu, help, trial, pagar, subscribe, link, convo, progress, profile, reset, family, kids, mama
Handlers missing from the menu: clase/class, connect, country, slang, help_banking/medical/school/shopping/transport/emergency,
org, feedback, invite/invitar/refer, demo, scenarios (admin/addsub/metrics rightly hidden).

## 4. Connect-now (ranked)
1. `/help_immigration` + `/help_housing` + into the menu.
2. `/culture` from `get_country_scenarios`.
3. Fix the `/menu` `_` replace + add connect, country, invite, feedback, org, clase, help_emergency to BotFather menu.
4. `/review` cards from session lists (SRS already written).
5. Day-7 / day-30 feedback prompts from `payment_reminder_loop`.
Hygiene with any deploy: remove the subscribers.json log dump.
