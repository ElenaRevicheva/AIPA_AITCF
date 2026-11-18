# Whole-dashboard readers (18 Nov 2026)

What: the full signed-in dashboard (local build of ascent `4241f0d` = what waited on Publish, LIVE functions), a temporary
test family with a realistic first week (2 WhatsApp + 1 Telegram chats, 6 phrases, 2 family notes), phone 412px, EN/ES/RU,
each page cut into 2 halves. Same 3 personas, Gemini via the free-first waterfall on Oracle. Test family deleted (0 rows).

| | EN | ES | RU |
|---|---|---|---|
| Best | First year in Panamá (5) | First year (5), face-to-face prep (4) | First year (5), phrases collected (5), face-to-face prep (5) |
| Worst | referral cards (1) | referral cards (1), web chat (2) | referral cards (1) |
| Would pay after trial | yes | no (native Spanish speaker) | half 1 yes / half 2 no |

FIXED the same day (ascent, see git log 18 Nov): referral cards folded into one line; class nudge claimed "3 days" for a
child who never had a class; phrases listed twice (family's week + collected); voice recording preselected English on the
Russian page; Spanish page 3px wider than the phone ("Empezar").

Test artefacts, not product defects: referral link "localhost" (local build), "my kids are 5 and 8" (persona vs test family).

OPEN - Elena's call:
1. All three asked for the kids' class to be visible on the dashboard (unit, next topic, progress) - "missing" in every read.
2. Meanings stored in English only; RU wants Russian; ES (native speaker) wants Panamanian local Spanish, not English.
3. "Video moments / Introduce your family": 2-3, "a bit creepy" - wording or placement.
4. "Мишка & Лиса · Russian beta" confused the English reader (placed in card 3 for everyone on purpose, 12 Nov).
5. Welcome banner = prime space, little use (EN 3).
Raw: `2026-11-18_whole-dashboard-readers.json`.
