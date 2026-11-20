# Michael (Panamanian English coach) + Loora — does EspaLuz fit? (20 Nov 2026)

Elena met Michael, a native-Spanish English coach. He named the app **Loora** and asked: can he write/speak Spanish and get
**English-only** coaching replies inside EspaLuz? Elena: explore, no edits; do it only if it is a small switch, never a rebuild.

## Loora in one paragraph (third-party listings + App Store; pricing NOT verified)
AI English speaking tutor, voice-first: real-time spoken conversations, role-play (job interview, meeting, travel, small talk),
instant grammar / pronunciation / fluency feedback, accent work, 24/7. English-only immersion. Free download with in-app
subscription (listings say $11.99/mo or $59.99/yr - unverified). No family, no country, no kids, no Spanish.
Sources: apps.apple.com/us/app/loora-learn-english-with-ai/id1552708303 · 10web.io listing · sourceforge.net/app/loora

## What Michael is really asking (as an English coach)
Immersion mode: "whatever language I type in, the coach answers in English and corrects my English" - the Loora model.
Coaches push this because bilingual answers let the learner read the Spanish half and skip the English (crutch effect).

## What EspaLuz does today (code, not memory)
- The "I already speak Spanish" path EXISTS (18 Nov): `settles()` in ascent `supabase/functions/espaluz-chat/index.ts:271`,
  twins `_settles()` in both bots' `espaluz_enhancements.py:1065`. It turns on: no beginner Spanish, this country's own words,
  ENGLISH COACH (every phrase to learn is English, "Better: ..." corrections, max 2 per reply).
- **Bilingual is by design, not a bug:** `BILINGUAL, ALWAYS` (index.ts:145), `BILINGUAL_LAST` (index.ts:1619, the last and
  strongest rule) and the coach line itself ("The reply keeps both languages, as always", index.ts:294). So WhatsApp giving
  Spanish+English pairs to the Spanish path = working as built.
- **Why the web felt stuck:** Elena typed "I already speak Spanish" into Q3 *Which language does your heart speak?* - but the path
  is switched on by the LATER question *What do you want to learn?* (4th option), or by heart language = exactly "Spanish".
  Q3's buttons have **no Spanish option** (English, Russian, Ukrainian, Portuguese, French, German, Italian, Chinese, Arabic,
  Hindi), and free text "I already speak Spanish" does not match `^spanish$`. A native Spanish speaker has no button for their
  own heart language. -> small real bug (one option in `FamilyProfileDialog.tsx:72`), worth fixing anyway.

## Size of an English-only mode
Not a rebuild, not one line either: a new answer (e.g. "English only, coach me") + an override of the three bilingual rules,
in 3 places that must stay twins (web brain + WhatsApp + Telegram bots), plus checking voice replies and cards. ~half a day
with production proof. It contradicts the standing rule "grown-up replies stay bilingual" (Elena, 6 Nov) - her call.

## Fit verdict
Michael is not EspaLuz's buyer: EspaLuz = families adapting to a NEW country (memory, mood, manner, kids classroom).
A Panamanian at home wanting an English-only speaking tutor is Loora's customer, and Loora is voice-first role-play,
which EspaLuz does not try to be. Do NOT build an immersion mode for one person.
What IS worth it: (1) add Spanish to Q3 (tiny, helps the real 18 Nov segment - Latin Americans moving between countries);
(2) Michael as a **referrer**, not a user: his students who relocate, or expat families he meets who need Spanish+English.
