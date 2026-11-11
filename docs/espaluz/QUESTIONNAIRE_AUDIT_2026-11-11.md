# "About your new life" questionnaire - is every answer really used? (11 Nov 2026)

Elena asked: no simulated questions. Traced in code (ascent `src/components/dashboard/FamilyProfileDialog.tsx`,
`supabase/functions/espaluz-chat/index.ts` `profileLine()` + `belongingBlock()`, bots' twins `profile_line()` /
`belonging_country()` in `espaluz_enhancements.py`, `src/pages/Classroom.tsx`).

Two kinds of use:
- **HARD** = code picks data or behaviour from the answer (deterministic).
- **SOFT** = the answer is written into EspaLuz's instructions as a sentence ("THIS FAMILY'S NEW LIFE: ...") on web,
  WhatsApp and Telegram; the AI is told to use it, but nothing forces a specific behaviour, and no log proves the reply changed.

| # | Question | Where it goes | Use | Verdict |
|---|---|---|---|---|
| 1 | Where is home now? | picks 1 of **21 country packs** (647 checked facts: holidays 67, school life 33, rhythm of the year 100, local expressions 76, newcomers find hard 55...) on web + both bots; Telegram life/road cards | HARD | strongest question; empty = Panama default |
| 2 | Where does your story begin? | sentence in instructions ("build bridges") | SOFT | packs exist only for destinations, so bridges come from the AI's general knowledge, no checked facts |
| 3 | Which language does your heart speak? | sentence: may explain a word in that language | SOFT | real but small; replies stay Spanish + English by design |
| 4 | How long have you been here? | sentence "they moved: ..." | SOFT, weakest | the 'why' promises "getting by first, belonging later"; no rule maps stage -> behaviour |
| 5 | Who is on this adventure with you? | sentence "household: ..." | SOFT | overlaps the Family Members list, which is the strong source |
| 6 | Who are the little ones? | Family Members table: chat names/ages on all 3 channels, classroom (`Classroom.tsx:259`), kids-memory | HARD | strong |
| 7 | How does Spanish feel today? | sentence "Spanish today: ..." | SOFT | the 'why' promises "pitches every answer at your level"; no explicit level rule |
| 8 | Biggest difference this month? | sentence "what matters most now" | SOFT | could steer which pack sections come first; not wired |
| 9 | What do you miss most? | sentence ("piece of home") | SOFT | fine as conversation fuel |

Missing answers: EspaLuz may ask ONE of them lightly per conversation, never as a form (`profileLine`).

## Decision for the test (Elena's push-back rule)
Nothing is fake: every answer reaches all 3 channels. But 6 of 8 answers are soft and unproven.
Do NOT redesign the questionnaire before launch. Cheapest proof first: one live test (same question, check the reply
reflects home country + level + focus). Only if replies ignore them: add explicit rules for #4 (stage), #7 (level) and
#8 (focus -> pack sections) in the 3 twins (web function + 2 bots).
