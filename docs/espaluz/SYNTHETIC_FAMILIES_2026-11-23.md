# EspaLuz — 5 paths × 3 channels, walked by synthetic families (23 Nov 2026)

Elena: "switch on human-like users that click each channel inside each of the 5 paths, and prove with production logs that
each one is delivered to the right channel." Before this run, production held **no stranger traffic on any path door**
(only Elena's own tests, phone …6716), so there was nothing to prove from real users.

## How it works (production, not a copy)

- **Synthetic ids no real person can have:** WhatsApp `+9990000NNNN` (country code 999 does not exist), Telegram
  `99990000NNNNNNN` (15 digits; real ids are ~10).
- They walk the **real running bots** (same webhook, same handlers, same brain). Only the last step changes: the reply is
  written to the log as a `🧪 … synthetic … reply` line instead of being delivered (`espaluz_synthetic.py`, twin in
  EspaLuzWhatsApp `ede58f0` + EspaLuzFamilybot `2e799d5`; 8 tests `scripts/test_synthetic.py`).
- Telegram cannot deliver a message from a user who does not exist, so the Familybot opened a **localhost-only door**
  (127.0.0.1:8097, synthetic ids only, Bearer secret) that feeds the message into the bot's own handlers.
- cto-aipa `/api/crm-event` refuses synthetic ids (`bda51bb7`): log `[crm-event] 🧪 synthetic test user - not pushed`
  — no HubSpot deal, no alert to Elena.
- Each persona sends **exactly what the landing button sends**, waits, then asks one real question in their own language.
  Runner: `EspaLuzWhatsApp/scripts/synthetic_families.py` (on Oracle). Web: `cto-aipa/scripts/espaluz-synthetic-web.mjs`
  (headless Chrome, persona locale, clicks the card open like a person, then the button; signed out, then signed in).
- Full log lines of the run: Oracle `~/_session-backups/synthetic-families-2026-11-23T12*.json`.

## Personas

| path | persona | WhatsApp button | Telegram button | web button |
|---|---|---|---|---|
| expat | Sarah, US mom, 2 kids, Panama City (EN) | `spanish` | `/start spanish` | `/path/expat` |
| nomads | Tom, remote designer, Medellín (EN) | `both` | `/start both` | `/path/nomads` |
| settle | Mariela, Venezuelan mom in Panama (ES) | `settle` | `/start settle` | `/path/settle` |
| pro | Andrés, Colombian, remote-job English (ES) | `pro english` | `/start proen-landing` | `/pro-english` |
| russian | Olga, family from Moscow in Panama (RU) | `both` | `/start both` | `/path/russian` |

## Result — production evidence (UTC, 23 Nov 2026)

| path | Web | WhatsApp | Telegram |
|---|---|---|---|
| expat | ✅ `learning_sessions` learn=Spanish path_from=landing 12:41:22 → /dashboard "Welcome to Your Spanish Journey" | ⚠️ path switched 12:32:23 (🇪🇸 reply) **but answered for SPAIN**: "Aunque noto que mencionas Ciudad de Panamá, yo te acompaño en España" 12:33:24 | ✅ switched 12:32:23; Panama-correct pharmacy answer 12:33:30 |
| nomads | ✅ learn=Both 12:41:45 → /dashboard (same text as expat) | ❌ switched 12:33:44, then **"Where do we start?" got the command MENU**, not an answer 12:34:24 | ✅ switched 12:33:44; Medellín answer, both languages 12:34:51 |
| settle | ✅ learn=settle 12:42:09 → /dashboard "Welcome to your life in your new country!" | ✅ switched 12:30:49; Panamanian words answer 12:31:46 | ✅ switched 12:30:49; answer 12:31:57 |
| pro | ✅ /pro-english coach, signed out and signed in | ✅ Pro English opened 12:35:05; coach turn 12:35:45 | ✅ Pro English opened 12:35:05; coach turn 12:35:45 |
| russian | ✅ learn=Both 12:43:11 → /dashboard **in Russian** | ❌ switched 12:36:25, then her Russian question got the map + **"which country are you in?" form — not answered** 12:37:06 | ⚠️ answered 12:37:25 (Panama, pharmacy, 911) but in Spanish/English only, no Russian |

Score: **routing 15/15 correct** (every button switched on its own path). **First experience 10/15 right, 5 wrong.**

## What a stranger hits that is wrong (root causes, with code)

1. **"spanish" = Spain** (WhatsApp, expat path). `detect_user_country` keyword list for `spain` contains the word
   `"spanish"`; the expat button sends exactly `spanish`, so the family's country is stored as Spain. Real US numbers
   (+1) fall through to the keyword guess too, so every US expat who taps the button is answered for Spain.
2. **Help-word substring** (WhatsApp, any path). `is_help_request = any(w in text_clean ...)` for `help, menu, start,
   info, ayuda…` — any sentence containing "start", "information", "ayudar", "menudo" gets the menu instead of an answer.
3. **Country form swallows the first question** (WhatsApp) when the number's prefix is not Latin American / Spain / US —
   real Russian (+7), UK, EU families: their first real question is replaced by "which Spanish-speaking country?".
4. **Payment-first welcome** (WhatsApp, every family path except Pro English): the first message a newcomer reads is the
   old 14-days/PagueloFacil/PayPal-link block, mostly English, before the path's own reply.
5. **Telegram after the path reply** sends the English map + an English "where are you located?" form — also to the
   Spanish-speaking settle and the Russian path.
6. **Web signed out**: all four family paths open the same sign-up ("Live your new country in Spanish") — the chosen path
   is not named; the landing does not follow the visitor's browser language (es-PA / ru-RU visitors saw English).
7. **Russian path** never answers in Russian on WhatsApp/Telegram, although the menu says "English, Spanish or Russian".

## Test data left in production (all synthetic ids, easy to find)

WhatsApp `+99900003003/3201/3302/3504/3605`, Telegram `999900000003003/3201/3302/3504/3605` (trial rows, bot memory,
onboarding files), web/class accounts for Telegram ids `9999000000009011..9015` and the class links sent to settle/expat,
4 `learning_sessions` family_profile rows (12:41–12:43). Not deleted yet — waits on Elena's go.

## Strict human-like families (same day, 13:30–14:35 UTC)

Elena: "make those test families truly human-like and truly very critical, very strict." Each persona (Jennifer US mom, Lukas
German nomad, Valentina Venezuelan, Carlos Colombian dev, Marina from Moscow) taps the button, asks a real question the way that
person types, then reacts to what EspaLuz actually said with a follow-up written in character. Judged twice: hard rules in code
(path confirmed, no payment block before the answer, no menu/form instead of an answer, right country and no wrong one, the
persona's languages present, no flooding) AND the persona itself as a sceptical critic (score ≥ 8, "landed right", "would stay").

| run | passed (strict) | "I landed in the right place" | what was fixed before it |
|---|---|---|---|
| 1 (13:30) | 1/10 | 4/10 | first-reply fixes round 1 (Spain keyword, help words, country form, welcome, TG map, Russian row, web sign-up) |
| 2 (13:48) | 3/10 | 9/10 | no echo of their text, translation as a lesson, mood label hidden, Russian kept for bot-only families, "both" not a Spanish speaker, Pro English hears each answer |
| 3 (14:07) | **4/10** | **10/10** | lesson only under short messages, class link on app.espaluz.lat; harness waits for real answers |

Still flagged by the critics after run 3 (not fixed today): the kids-class offer arriving in the middle of an adult's question;
voice notes and buttons with no words saying what they are; Pro English has no visible 4-week programme and its level check
(3 questions, may be answered in Spanish) gives a CEFR guess a strict user does not trust; on Telegram the Russian path's first
answer can still come without Russian; answers are long for a phone.
