# EspaLuz dashboard - "Learning Journey", "Telegram Sessions", "Spanish Learning Modules" audit (15 Nov 2026)

Elena asked: are these blocks fresh, real and useful for a family, or stale and generic? Checked against the code
(ascent-saas-builder `src/components/dashboard/TelegramProgress.tsx`, `LearningModules.tsx`, `src/data/spanishLessons.ts`,
EspaLuzFamilybot `main.py` `track_telegram_conversation`) and the live database (tester account, read-only queries).

## Verdict: mostly not real. Numbers look precise, but they are made up by formulas.

| What the screen shows | Where it really comes from | Real? |
|---|---|---|
| Learning Score **100** | `min(100, words*8 + sessions*10)` - any 4 chats + 6 "words" = 100 forever | No - capped formula |
| **6** Chat Sessions | one row per Telegram message that got synced (not a session) | Count is real, word "session" is not |
| "6 session streak" | `min(7, number of rows)` - not days in a row | No |
| **0** Spanish Phrases | the bot never writes `phrases_practiced` (0 of 6 rows, 0 users ever) | Always 0 |
| **26** Words Mastered | 5 words pulled per message from the user's AND the bot's text: "say", "these", "teh", "beilys", "nyah", "elena", "cuban" | No - junk words, includes English, typos, names |
| **150m** Time Invested, avg 25m | bot sends `message_count*0.5` capped at 30; the count only grows, so every row = 30 min | No - invented minutes |
| Telegram Sessions list | the first 80 chars of what the user wrote in English ("Poison my family." = a voice mishearing) | Real text, little value |
| Title "Telegram Bot Learning Journey" | Telegram only. **WhatsApp chats are never written as sessions** (only notebook facts), web chat and the classrooms are not in it | Misses 2 of 3 channels |
| Spanish Learning Modules (15 lessons) | fixed list in `spanishLessons.ts` from mid-2025 - same for every family | Generic, static |
| "Not started" with a FULL purple bar | progress table `user_module_progress`: 2 rows in total, last July 2025; the bar's track is the same purple as its fill | Looks complete, is empty |

Also on the dashboard: a red "ENHANCED Debug Info" panel in the same component (developer leftovers).

## What IS real and fresh today (already in the database, nothing to build to collect it)

- **Family notebook** (`family_fact`, from WhatsApp, Telegram and web) - what EspaLuz really learned about the family.
- **Kids classrooms** (`classroom`, `classroom_ru` rows): units done, words the child really said, the parent report.
- **Practice** (`practice_session`, new 15 Nov): the scene, "went well", "to fix", and the **phrase to keep** for the real day.
- **Celebrations** (`celebration_video`) and talking clips.
- **Real activity per channel** from row dates (WhatsApp facts, Telegram turns, web chat, classroom).

## APPLIED 15 Nov (ascent 2cbf725), Elena: "keep only valuable stuff"
LearningAnalytics already shows the week (days, child units) and the family map card 7 the notebook, so only the
missing part was built: "Phrases to keep, and your next step" (FamilyNextSteps.tsx). TelegramProgress and
LearningModules are off the dashboard (files kept). Lesson Start buttons pointed to /learning-module/ (route is /learning/).
Data quality seen: notebook notes "Elena lives in Palouse" (voice mishearing of Panama?) - correctable in card 7.

## Original proposal

Replace the three blocks with ONE block, **"Your family's week with EspaLuz"**, built only from the real rows above:

1. **This week** - days you talked with EspaLuz, and where (WhatsApp / Telegram / web / classroom): real dates, no minutes, no score.
2. **Phrases to keep** - the "keep for the day" phrase and the "to fix" line from every practice, plus Spanish lines from
   the classroom reports. Each with its English. This is the real "Spanish phrases" list (today it is always 0).
3. **What EspaLuz knows about your family** - the 3 newest notebook notes, with the existing "correct it" link (card 7).
4. **Your child's class** - last unit, words said this week, link to the last report.
5. **Next step** - one suggestion from what is true: no practice yet -> "Rehearse your next appointment"; a notebook note
   about an upcoming event -> "Practise it" prefilled; child had no class for 3 days -> "10 minutes with Pere & Titi".

Remove: the score, streak, minutes, "words mastered", the Telegram-only list, the static modules list, the debug panel.
Bots: no change needed for v1 (everything comes from rows they already write). Later: WhatsApp could write conversation
turns like Telegram does, but only if a real use appears.

Effort: one web component + reading existing rows (no new tables, no new server function, no bot deploy). ~half a day.
Risk: low; old components stay in the repo, only removed from the dashboard (easy rollback).

## What to borrow from her own CRM (aideazz.xyz/ops) - read 15 Nov, proposal, NOT applied
Read: `aideazz/public/ops/index.html`, `src/record-timeline.ts`, `scripts/agents-team-snapshot.cjs`, `scripts/espaluz-truth-sync.py`.
1. **History first, one timeline per record** (record-timeline.ts: 3 sources merged newest-first, each tagged pipeline/email/queue)
   -> one family timeline: WhatsApp / Telegram / app / classroom / practice / notebook, newest first, each tagged by channel.
   All rows are already in `learning_sessions` (after the bots' brain sync deploys).
2. **Freshness on screen** ("EspaLuz checked 12 min ago", "⚠ sync late" over 120 min; truth_runs append-only)
   -> "Last heard: WhatsApp today 09:12 · Telegram 2 days ago"; the family sees the brain is live.
3. **Fail-closed, never mock rows** ("numbers are not available right now") - already the rule in FamilyNextSteps.
4. **Did it / Skip with write-back** (CRM job lane) -> next step cards get "Done" / "Not now", saved as an event, so a
   skipped suggestion is not repeated tomorrow and done ones count.
Not borrowed: the JSON snapshot cron (Supabase is queried directly), HubSpot mirroring.
