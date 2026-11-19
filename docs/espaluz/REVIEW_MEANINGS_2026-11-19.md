# EspaLuz 19 Nov 2026 - word meanings for /review · neutral persona · opt-in morning reminders

Elena: "do 2, 3, 4" (from the Telegram menu audit's open items + weekly plan step 2). All live 19 Nov 10:31 UTC.

## 2. /review has real meanings
- **Broken:** the Telegram tutor saved every word as its own translation (`main.py add_vocab(word, word)`) - 140 of 141
  saved words; /review had nothing to show.
- **Fix (no new engine):** `EspaLuzFamilybot/espaluz_phrases.py` = line-for-line TWIN of ascent
  `supabase/functions/_shared/phrases.ts` (the finder the web and submit-progress already use). After each reply the
  bot saves the phrases EspaLuz taught WITH their English. The old word tracker stays (it feeds /progress) but can no
  longer overwrite a real meaning (`espaluz_memory.add_vocabulary` upsert).
- **Both twins learned the most common Telegram shapes** (measured on 200 real replies): `"X" = English` (29 replies) and
  `"X" (pron) - "English"`; a phrase found twice keeps the copy with a meaning. Meanings found in those 200 replies:
  152 -> 188. **Parity: 199/200 identical** - the 1 difference is JS `\b` treating accented letters as word breaks
  (TS accepted a Spanish sentence as "English"); Python is the stricter one.
- **Backfill** from each family's own past replies (conversation memory): +78 phrase meanings. Words with a real meaning:
  **1 -> 80** (2 families: …862, …723). Some are imperfect ("un café con leche - with milk", "ubicar = to locate").
- **Deployed:** kids-memory, submit-progress, espaluz-chat (the web dashboard copy of the finder waits on a Lovable Publish).
- **Proven:** a stranger asked "how do I ask the waiter for the menu and the bill?" -> /review showed
  "¿me trae el menú, por favor? - Can you bring me the menu, please?" and 3 more, tap to reveal.

## 3. Strangers are no longer "elena, parent, 39"
- The Telegram bot began as the founder's family bot: anyone it could not place got the persona `elena` and the AI was
  told "AGE: 39 years old, ROLE: elena" (5 prompt builders + the session default).
- **Fix:** two neutral personas `learner` / `parent` (no age) added; the fallback in all 5 places = `learner`;
  "mama/mother" words -> `parent`; the prompt says "AGE: not told yet - talk to them as an adult" instead of a number.
  Elena herself is still recognised ("soy Elena", her Telegram first name). No saved session carried the wrong role
  (checked: 3 sessions), so nothing was migrated.
- **Proven:** a new stranger's saved profile = `family_role: learner, age: null`.

## 4. Opt-in morning reminders (weekly plan, step 2 - Table 2)
- `remind` / `/remind` turns on ONE line on **Monday, Wednesday, Friday 7:45-9:00 Panamá time**: the first step of
  "Your plan this week" not done yet (kids-memory `plan_get` now also returns the plan). `remind off` stops it.
  No message when the week is done. Never at night, never daily, no streaks.
- Inside the bots' EXISTING 10-minute loops (Telegram `kids_report_loop`, WhatsApp payment/proactive loop) - no new
  process. Twin code in `espaluz_enhancements.py` (both bots identical, md5 `267d90b6`). Opt-in list per bot:
  `morning_reminders.json`; marked before sending, so a crash never sends twice.
- WhatsApp: only to people who wrote in the last 23 h (WhatsApp's rule; the opt-in reply says so). Unlinked chats get a
  pointer to the dashboard (the plan lives there).
- **Proven (sends captured):** Mon 8:00 -> Jennifer "🎭 rehearse a moment that is coming", Carlos "🇬🇧 5 minutes of
  English: «Tell me about yourself»"; Mon again / Mon 18:30 / Tue 8:00 / Wed 7:44 -> nothing; Wed 7:46 -> sent;
  after Carlos's `/remind off`, Fri -> only Jennifer.
- Menus: Telegram `/remind` added at the END of the command list (getMyCommands 25) + one /menu line; WhatsApp one
  welcome line. Nothing removed.
- Known limit: Panamá clock for everyone (families in Mexico/Colombia get it 0-1 h off).

## Live state
Familybot `c6bff59` (main e3b75fd2, enh 267d90b6, memory cc24970a, phrases a7bca922), WhatsApp `3d06fcf` (bridge
70c4a6d0, enh 267d90b6), ascent `b192120`; both services restarted 10:31:27 UTC, Telegram `📡 Starting polling`.
Backup `~/_session-backups/review-persona-remind-20261119/`. All test users, families, conversations and saved test
phrases removed; live JSON files byte-identical before/after the tests.
