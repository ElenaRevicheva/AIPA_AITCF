# EspaLuz WhatsApp menu audit - 18 Nov 2026

Elena: "dig into each comment with production logs and testing - does it truly work and serve the user? No stale, useless
comments that make noise." **Nothing in the menu has been changed yet** - this file is the evidence; the wording is her call.

## How it was checked
1. **Production history (Twilio, every WhatsApp message 14 Oct - 18 Nov):** 404 messages, 77 incoming, from **4 people**
   (Elena and her test numbers). So usage cannot say what strangers value - nobody outside has used the menu yet.
   Menu words ever typed: `menu` 8, `connect` 7, `kids` 2, `adult` 1, `conversation` 1, `end conversation` 1, `mapa` 1,
   `translate mode` 1. Every other entry: **0 uses in 5 weeks.**
2. **Live code test:** the REAL bridge code (copy of the bot folder on Oracle, server + reminder loop not started), every
   Twilio send captured instead of delivered, HubSpot / Telegram / PagueloFacil blocked, a fictional 555 number typing
   each word. Everything the test created was removed afterwards (bot DBs 0 rows left, web 0 accounts, HubSpot deal +
   contact archived, shared fair-use counter entry removed - see "Test hygiene" below).

## Verdict per entry

| Menu entry | Works? | Evidence | Verdict |
|---|---|---|---|
| `help` / `menu` | ✅ now whole | 4 parts arrive (Translate + Motivational back since 22:36 fix `cc190bf`) | keep - but it is **4 long messages**: too much |
| `mapa` | ✅ | real use 12 Nov + test | keep |
| `plan` | ✅ | test: unlinked -> pointer to dashboard; linked -> plan (proven earlier today) | keep |
| `english` / `spanish` / `both` | ✅ | test: each switches + clear reply | keep |
| `settle` | ✅ | test | keep |
| `translate mode` / `tutor mode` | ✅ | real use 18 Nov (voice translated) + test ("Hi, where is the pharmacy?" + voice) | keep |
| `conversation` / `end conversation` ("MOTIVATIONAL MODE") | ✅ | real use 6 Nov + test | keep, **rename**: the bot itself calls it "Emotional AI Language Coach" (voice talk + emotions); the menu calls it "Motivational". Its welcome is long and says "BETTER than Google Translate" |
| `kids` | ✅ | real use 31 Oct / 1 Nov (Pere remembered the last lesson); unlinked -> asks for the family account | keep |
| `adult` (return from kids) | ⚠️ only inside kids mode | real use 6 Nov OUTSIDE kids mode: "adult" was **translated as a word** + an adult-vocabulary lesson; in the test it started the new-user setup | keep, say "(inside kids mode)" |
| `clase` | ⚠️ description wrong | menu: "A FIRST-GRADE CLASS (reading, words, numbers)" - on WhatsApp it sends a **one-tap link to the web classroom** (and creates a web family account if none) | keep, **reword**: "clase -> one-tap link to the web class" |
| `connect CODE` | ✅ | 7 real uses, all "Connected!" | keep |
| `pagar` | ✅ (up to the payment site) | test reached PagueloFacil (blocked on purpose); 0 real uses | keep |
| PayPal link | not opened in test | 0 real uses | keep |
| `trial` | ❌ **BROKEN** | menu: "Type trial to check your free trial status" -> the bot **translates "trial"** (prueba / ensayo / juicio) and gives a lesson. No handler exists | fix (wire to the existing trial status) or remove the line |
| `my preferences` | ⚠️ saves, nothing uses it | shows a preferences menu | see next row |
| `go slower` / `more audio` | ❌ **promise without effect** | reply "Got it! I'll adapt my teaching" - saved in `user_learning_preferences`, but **no code ever reads it** to shape a reply (only reader = the save itself) | remove from menu, or wire it (Elena's call) |
| `family setup` | ✅ | restarts the family questions | keep, but see the "setup swallows words" defect |
| PRACTICAL HELP "(Coming soon)" | ❌ label false | `help banking`, `slang`, `business english` WORK today (rich Panamá answers). Bare `banking`, `shopping`, `housing`, `immigration`, `emergency` are NOT triggers - only `help banking` etc. (bare `emergency` gets a good AI answer with Panamá numbers anyway) | remove "Coming soon"; show the words that work: `help banking` · `help medical` · `help school` · `help housing` · `help immigration` · `slang` · `business english` |
| "14 days FREE ... Unlimited AI conversations" (welcome) | ⚠️ not true | trial users have a **30 messages/day** cap (`fair_use.py`, every message counts, menu words too). 0 real hits in 5 weeks | reword: "up to 30 messages a day" (or count only real questions) |

## Defects that are not one line
1. **The new-user setup swallows menu words.** While a new person is answering "your name? / tell me about your family",
   `connect ZZ9ZZ9` and `banking` were taken as the answer ("¡Gracias, Tester! ¡Empecemos a aprender!"). A stranger who
   types a menu word in the first minute gets nothing. Fix: let menu words pass through the setup.
2. **The sender cut every text at 1500 characters** - FIXED today (`cc190bf`): long texts now arrive in ordered parts.

## Test hygiene (what the test touched and what was undone)
- HubSpot: new-user hook created deal + contact for the 555 number at 22:41 -> both archived (recycle bin 90 days). The
  harness then blocked the hook (OUTREACH_SECRET empty).
- Web (Supabase): `clase` created a family account + WhatsApp link at 22:45 -> deleted (guarded: 0 activity, 1 link).
- Bot DBs: 8 rows (user, trial, emotional history x2, events x3, snapshot, prefs, whatsapp_users) -> deleted; scan = 0 left.
- Shared live file `~/EspaLuzFamilybot/fair_use_counts.json` (both bots use it): test count 32 removed; no other entry
  was in it; backup `~/_session-backups/wa-split-20261118/fair_use_counts.json.before-clean`.
- Lesson for the next test: the WhatsApp bridge imports shared modules from the Familybot folder, so a folder copy does
  NOT isolate those files; block `fair_use` writes too.

## Proposed short menu (NOT applied - for Elena)
Today's menu is 4 messages and ~4,400 characters. A shorter true version (same entries, nothing removed except the broken
promises she decides on):

```
¡Hola! I'm EspaLuz - your family's Spanish & English companion 🇪🇸🇬🇧
Write or send a voice note in English, Spanish or Russian: I answer in both, with voice, and I remember your family.
📸 A photo of any sign, menu or letter -> I translate and explain it.

🗓 plan - your plan this week
🗺️ mapa - who I am, where to find me
🇬🇧 english · 🇪🇸 spanish · both - what we practise
🧭 settle - you already speak Spanish: local ways + English
🔊 translate mode - quick voice translation (pharmacy, doctor) · tutor mode to return
💜 conversation - talk it through by voice · end conversation to stop
🏦 help banking · help medical · help school · help housing · help immigration · slang · business english
👧 kids - Pere & Titi (needs your family account) · clase - link to the web class · adult - back (inside kids mode)
🔗 connect CODE - join your family account from app.espaluz.lat
💳 pagar - $11 / 30 days · trial - your free days left
help - this menu again
```
