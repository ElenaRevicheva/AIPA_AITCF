# EspaLuz → companion: what competitors do, what we already have, what to connect (3 Nov 2026)

Merges `COMPANION_MECHANICS_2026-11-03.md` (market, with sources) with a read-only inventory of our own code and data
(WhatsApp, Telegram, web, kids). Golden Rule 6b: every item is a connection, a prompt line or a small step inside code
that exists. Nothing here is built yet — each waits on Elena's OK.

## The verdict in numbers (measured 3 Nov from production data, phrases only, no user content)
- **Kids (Pere & Titi) already behave like companions**: memory card, the hello memory game (6 hellos opened "la última vez
  me…"), Panama holidays, places, weekly stories, parent report (21 sent in 7 days).
- **Adults are still a tutor template** on all three channels. Adult bot replies, last 90 days (n=84): **61% open "¡Hola <name>"**,
  **23% "entiendo que…"** in the first 80 characters, **20% "estoy aquí para…"**, **70% push a practice / "¿quieres…"**,
  only **17% end with a question**, average **1,229 characters**. The prompts ask for it: WhatsApp "1500-2000 characters"
  (`espaluz_bridge.py:2998,5538`), "Use 10-15 emojis" (`:2972`), "the world's most emotionally intelligent and educationally
  profound bilingual tutor" (`:2937`); Telegram "ALWAYS address them as {user_name}" (`main.py:1840`), "Start your response
  with empathy. Consider using: …" (`:2144`), "Use EMOJIS GENEROUSLY" (`:1747`); web "Make every interaction educational and
  structured" (`espaluz-chat/index.ts:166`). No prompt says "vary your opener", "match their length" or "you may simply chat".
  This is exactly the market's #3 and #4 complaint (stock phrases, scripted tutors).
- **Kids staleness** (Supabase classroom, 30 days, n=238): 18.5% end "¿Quién tiene razón, Pere o Titi?" (~6 per lesson-day;
  the prompt asks for 1-2); 24% are the tracing template "¡Qué bonita tu X! Ahora dila tú"; 20% push "say the whole sentence".
- **Memory of grown-ups barely exists**: `user_memories` = 13 rows (7 test, 6 family); the only writer is onboarding.
  The READ path is already wired (`build_enhanced_context`, `espaluz_enhancements.py:756-761`).
- **Traffic is tiny**: WhatsApp 1 active family in 7 days, Telegram 65 messages, web adult chat 0 rows in 30 days.

## ⚠️ Platform constraint
WhatsApp Business API bars general-purpose AI chat companions since 15 Jan 2026; services "ancillary to a legitimate
business" stay allowed (TechCrunch 18 Oct 2025). → On WhatsApp EspaLuz stays **a language + relocation-help service**
(welcome text and prompt say so). The open "friend you can talk to about anything" lives on **Telegram and web**.
Proactive WhatsApp messages outside 24 h need paid templates (Oct 2026) → companion callbacks on WhatsApp go **in-band**
(in the next reply), on Telegram they can be sent.

## Competitor mechanic → our piece → the connection
| # | Mechanic (who) | What we already have | Gap | Smallest fix | Size |
|---|---|---|---|---|---|
| 1 | Remembers the conversation (all) | Telegram: last 5 turns + RAG; WhatsApp builds the block | **Web adult chat writes `session_type='chat'`, reads `'dashboard_chat'`** (`index.ts:1120` vs `:1018`, UI `ChatWithEspaluz.tsx:103`) and never reverses order → zero memory. **WhatsApp sends only the new message** as `messages` (`bridge:3026`) | 2 lines web; pass last 6 turns on WA | tiny / small |
| 2 | Not stale, not pushy (complaints #3-4; Lily, Character.AI) | prompts exist on 3 channels | the lecture-every-turn lines above | answer at the length of the message; greet once a day; rotate openers; ≤1 practice offer; ≤3 emojis; "you may simply chat"; honest warmth, no flattery (complaint #1), no guilt at goodbye (complaint #2) | line edits ×3 |
| 3 | Callback to a remembered life event (Lily, Praktika **+24% D1**) | WA detects + stores `user_followups` (3 pending since ≤21 Oct, blocked by the 24 h window) | not sent; Telegram has none | **in-band**: a due follow-up becomes "ask about it naturally" in the next reply (WA); Telegram: port detect + send into `payment_reminder_loop` (`main.py:3794`) | small |
| 4 | Lasting facts about the family (Lily, Speak, Replika) | `save_memory` + read path wired | no writer | after each reply, free-chain "0-3 lasting facts" → `save_memory` | small-medium |
| 5 | A character with its own life, paced (Tolan, Lily) | kids personas + 7 weekly stories; adults: **no persona** (0 hits) | adults faceless; kids' lives don't move | ~10-line EspaLuz persona card shared by 3 prompts (warm Panamanian friend, honest she is an AI, light humour, "this week in <city>"); Pere & Titi "what we did this week" line from the existing story rotation | small |
| 6 | Practical assistant (ChatGPT tasks, Sesame) | photo → explanation, interpreter mode | no "draft my message to the landlord / school", no call script | one clause in the adult prompts (model-native) | tiny |
| 7 | Today-aware (ChatGPT, Gemini) | `KIDS_HOLIDAYS` (Panama, kids only); adults get only the date | adults miss feriados | reuse the KIDS_HOLIDAYS pattern per country from `country_contexts.py` | small |
| 8 | Kids variety (Ello, Yoto rituals) | rich kids brain | 3 stock lines dominate | cap "¿Quién tiene razón?" to once a lesson; rotate 5 tracing praises (`index.ts:678,1093`); "whole sentence" ≤ once per 3 turns | tiny |
| 9 | Parent bridge + streak + share (Buddy, Ello, Duolingo) | parent report (21/7 days), `/invite` link | **header hardcoded "📒 Alisa's lesson"** (`Familybot/main.py:3593`); no streak; no invite line | child's real name; "🔥 N days in a row"; "💌 give a newly arrived family 14 days free: <link>" | small |
| 10 | Live local info via search (Sesame, ChatGPT) | 21 country contexts (Panama 4.9 KB, others 0.45-2.6 KB) | no search anywhere | later — medium (a search API in the free chain) | medium |
Skip: avatars/video calls, hardware, XP/relationship levels (gamifies friendship).

## Recommended order (launch = first impression → feel known → come back → spread)
1. **Batch A — first impression (before any promotion).** #1 memory fixes, #2 de-push prompts on all 3 channels, #8 kids
   variety caps, #9 the "Alisa" header, WhatsApp service framing. All line edits; the web part rides the next Lovable Publish
   together with Wave 1 (`LAUNCH_CONNECT_LIST_2026-11-03.md`), the bots deploy to Oracle.
   Proof: re-run the phrase measurement after a week — target "¡Hola <name>" < 20%, average reply < 500 characters for a short message.
2. **Batch B — feel known.** #3 in-band callbacks + Telegram follow-ups, #4 fact capture, #5 persona card + Pere & Titi's week, #6 practical clause.
3. **Batch C — come back + spread.** #9 streak + invite line, #7 holidays for adults.
4. Later: #10 live local search.

## Hygiene seen (not fixed, report only)
WhatsApp journal prints part of the DB connection string at every start (22× in 7 days) — remove that log line;
Telegram webhook-killer writes ~70k log lines a week; photo OCR calls `gpt-4o` directly on both bots (outside the free-first
waterfall); `index.ts:179` hardcodes Claude model ids.
