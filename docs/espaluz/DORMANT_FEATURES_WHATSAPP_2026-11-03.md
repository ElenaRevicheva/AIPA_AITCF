# EspaLuz WhatsApp — built but unreachable (3 Nov 2026, read-only)

Local main `61dbd9e`; every Oracle `.py` = local by md5 (checkout HEAD `24e5c15` lags by design). Oracle-only untracked:
`whatsapp_mode_state.py` (Jan 31, persists tutor/translate mode to JSON, nothing imports it — ready fix for item I) and
`check_subscribers.py` (prints subscriber emails — never into git). Already wired 2 Nov (not repeated): follow-ups, family
context in replies, invites, testimonials, weekly recap, passes, country from prefix, help guides, kids lessons.
✔ = re-checked in code by the lead session on 3 Nov.

## 1. Built, not connected
| # | Feature | Evidence | User gets | Fix | Risk |
|---|---|---|---|---|---|
| A ✔ | **Words never saved on WhatsApp** | Telegram saves ≤5 words/reply (`Familybot/main.py:4450-4456`); WhatsApp has 0 `add_vocab` calls. DB: 109 vocab rows, all Telegram | the weekly recap's "words this week" (`espaluz_wa_growth.py:363`) is empty for every WA family | small (port; extractor start: `extract_spanish_from_translation` :1922) | low |
| B | **Spaced-repetition review** | `get_words_for_review` / `record_vocabulary_review` (`espaluz_memory.py:649,662`) no caller | "review 5 words" from the 10-min proactive pass | small after A | low |
| C | **Learning preferences saved, never used** | saved `espaluz_advanced_features.py:602-611` with "I'll adapt my teaching!"; never read; 2 rows | pace / audio / correction style honoured | small (prompt near `bridge:2665`) | low — fixes a broken promise |
| D | **Preference parser swallows normal messages** | `parse_preference_update` on every message (`advanced_features:600`); words like text/audio/direct/faster → "✅ Got it!" instead of an answer | questions answered | 1 line | low |
| E | **No /org partner codes on WhatsApp** | Telegram grants days (`main.py:5068`); WA has blocks: `extend_trial` (`user_trial_system.py:1046`), `validate_org_code` | QR/partner free days on WA | small-medium | medium (WA access table ≠ Telegram's) |
| F | **Family never captured** | write exists (`bridge:601-619`); `family_members` 0 rows, 0/22 WA users; prefix-country onboarding (2 Nov) skips the name→family chain | names in recap + context | small (offer "family setup" once) | low |
| G | Conversation Mode says "✅ saved to your learning progress" — nothing saved | `bridge:4980-5000` | honest / tips saved | small | low |
| H | /demo, /scenarios workshop | Telegram only | partner-workshop script | small | low |
| I | Translate mode lost on restart | in-memory `convo_sessions` (`whatsapp_convo_mode.py:66-80`); fix file on Oracle only | mode survives restart | small | low |
| J | Menu says "BUSINESS ENGLISH (Coming soon)" though it works | `bridge:5142` | honest menu | 1 line | none |

Still unbuilt (new work): `relocation_milestones`; `scheduled_messages` table exists, 0 rows, no writer.

## 2. Wired but broken (logs, last 3 days; low traffic)
- ✔ **Translation + emotion call OpenAI directly with retired/429 models**: `translate_to_es_en_only` (`bridge:1847`, `["gpt-4","gpt-4-turbo","gpt-3.5-turbo"]`)
  and `analyze_emotional_intelligence_with_gpt5` (`:2008`, `["gpt-5","gpt-4","gpt-4-turbo"]`), used every voice/text turn
  (`:2577, :3684, :3931`). Logs: "ALL TRANSLATION MODELS FAILED" ×1, "ALL EMOTIONAL ANALYSIS MODELS FAILED" ×1 (31 Oct, 1 Nov).
  Breaks the house rule (free-first `llm_chain`). Fix = route both through `llm_chain`.
- Kids voices: OpenAI TTS 429/503 ×6 (Pere 4, Titi 2) — the chain moved on.
- 2 Nov proactive pass logs nothing yet → no proof line of a sent follow-up/recap.
- 455 lines of TLS scanner noise (harmless).

## 3. Connect-now (ranked)
1. A + B: save WA words → daily review (makes the wired recap real).
2. C + D: honour preferences; stop the parser swallowing messages.
3. Translation + emotion onto `llm_chain`.
4. F: offer "family setup" once after the first reply.
5. E: WhatsApp `org CODE`.
