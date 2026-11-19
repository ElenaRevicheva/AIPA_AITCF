# EspaLuz Telegram menu audit - 18/19 Nov 2026

Elena (pasting the whole /menu): "Same, do the same with Telegram menu. Verify each comment without destroying anything,
without wiping. We need menu show all the comments that truly works." Twin of `WHATSAPP_MENU_AUDIT_2026-11-18.md`.

## How it was checked
- **Production evidence:** the Telegram bot logs no commands, its journal starts 22 Oct, and Telegram keeps no history a bot
  can read. The bot's own conversation memory (724 rows) only records what fell through to the AI: `/culture` twice
  (23 Jan) - proof it never had a handler. Saved vocabulary: 141 words, newest 17 Nov.
- **Live code test:** the REAL `main.py` in a copy of the bot folder, run up to (not including) command registration and
  polling; every telebot call captured; **all network calls to api.telegram.org blocked** - the start-up "webhook
  killer" calls `deleteWebhook?drop_pending_updates=true` with the real token and would have dropped families' unread
  messages; HubSpot, CTO webhook and payments blocked. Two fictional ids typed every menu command.

## Verdict per entry (before -> after)

| Menu entry | Before | Now |
|---|---|---|
| /start, /menu, /reset, /family, /kids, /mama, /tarjetas, /camino, /vida, /palabras, /progress, /country, /slang, /org, /feedback, /invite, /refer, /trial, /pagar, /subscribe, /link, /connect, /convo on/off/es/en, /demo, /scenarios, /english, /spanish, /both, /settle, /plan, /mapa | ✅ each answered correctly | unchanged |
| `/help banking` ... `/help emergency` (6 lines + quick reference) | ❌ **no reply at all**: `/menu` turned every `_` into a space, so `/help_banking` was shown as "/help banking" | ✅ shown as `/help_banking` etc. (tappable in Telegram); the 6 commands themselves always worked |
| `/org SU_CODIGO` | ❌ shown "SU CODIGO" next to "(MAYÚSCULAS, con guion bajo)" | ✅ underscore kept |
| `/review` (spaced repetition) | ❌ no handler: "I didn't recognize '/review' as a country" | ✅ shows up to 6 learned words due for review, tap-to-reveal meaning (the existing `vocabulary.next_review` schedule); newest words if none due; honest message if none |
| `/culture` | ❌ no handler: "I didn't recognize '/culture' as a country" (it reached the AI only outside setup) | ✅ = the life-in-your-country card (`/vida`) |
| `/metrics` "(admin)" | ⚠️ any stranger saw community numbers ("Total Users: 6") | ✅ team only (same admin id as /admin, /addsub); others get a pointer to /progress |
| `/profile` | ❌ a stranger was shown "Role: **elena**, Age: **39**" (the bot's built-in founder persona) | ✅ "Not set" until the person sets /family |
| `/feedback` | ❌ the next message within 24 h was saved as a testimonial even when it was a question ("how do I say good morning...?" -> "Thank you, saved. May we quote you?"), never answered | ✅ a real question is answered; /feedback can be sent again |
| Setup (country -> name -> role) | ❌ a stranger's question got "I didn't recognize ... as a country" or became their NAME ("Accept any text as name" = first word) | ✅ a real question is answered; the setup step waits (`_is_real_question`, twin of WhatsApp) |

Deployed 19 Nov 00:07 UTC: Familybot `dcec652`, live md5 `cc09c418`, backup
`~/_session-backups/tg-menu-fixes-20261118/`, log `📡 Starting polling`, getMyCommands = 24 (incl. /plan). Only 4 lines
changed in place (the menu cleaner, the card command list x2, the setup check); everything else is added; no command,
no menu line removed.

## Found, NOT fixed (Elena's call) - items 1 and 2 FIXED 19 Nov, see `REVIEW_MEANINGS_2026-11-19.md`
1. **The tutor saves words WITHOUT meanings:** `main.py` `memory.add_vocab(word, word, "word")` - 140 of 141 saved words
   have the word as its own "translation" (only "hola - hello" is real). `/review` now shows only words with a real
   meaning, so for most families it says "no words yet" until this is fixed. The meanings exist in the replies
   (phrase pairs); the web reads them with `_shared/phrases.ts`, the Python bots have no twin yet.
2. **Strangers are prompted as "elena, parent, 39":** `FAMILY_MEMBERS.get(..., FAMILY_MEMBERS["elena"])` is the default
   persona in 5 prompt builders (the bot began as the founder's family bot). Display fixed; the prompt default is not.
3. `/demo` and `/scenarios` (workshop presenter tools) and `/metrics` sit in the public menu.

## Test hygiene
Everything the tests made was removed: bot DBs (users x2, vocabulary 11, trials, emotional history, events,
truth_people, telegram_users x2), conversation memory + embeddings of the 4 test sessions (3 were left by the WhatsApp
runs and missed by that cleanup - found here by content), HubSpot 0, web 0. Live files checked: 0 test ids in
user_sessions, family_bindings, fair_use_counts, analytics, onboarding.
