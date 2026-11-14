# Alisa's tablet classes, 14 Nov 2026 - production log review (Claude)

Sources: Supabase `learning_sessions` rows + function logs (edge + console), 19:40-20:36 UTC.
- Russian class (`classroom_ru`): 38 turns, 19:42-20:22.
- Pere & Titi (`classroom`): 13 turns, 20:23-20:35.
- HTTP: every call 200 (kids-ru 39, voice-to-text 43, voice-ru 100, espaluz-chat 24, generate-voice 22). Nothing crashed.

## 🔴 1. The Russian class cannot hear Russian (crucial)
- `voice-to-text` ran in **auto-detect** with the Pere & Titi hint *"Spanish and English, sometimes Russian"* on every
  Russian-class turn: `ClassroomRu.tsx:377` sends no language and no Russian context.
- Whisper (with an English prompt) **translated** Russian speech into English, or produced Icelandic-looking noise.
  Of 30 spoken turns, **2** came back in Cyrillic.
- Examples:
  - "Oppa, Oh, eta, mam nihat, ya chto pinta…" (Russian written in Latin letters)
  - "My daughter Alisa doesn't want to do anything…" (the parent's Russian, translated)
  - "Mamma, hún er berjir." / "Ég lít ég." (Icelandic noise)
- **Fix:** the Russian class sends `language: 'ru'` plus its own hint ("a 6-year-old speaks Russian, sometimes English;
  they just asked: <Mishka/Lisa's last question>"). `voice-to-text` builds that hint from the `classroom_ru` rows, not
  from `classroom`.

## 🔴 2. Praise and the parent report are not true (crucial)
- Mishka praised "a whole sentence" for English, Spanish, Icelandic noise and an empty transcript. Model's own words:
  "You said a whole sentence in Icelandic", "a whole English sentence without mistakes".
- `said_ru` (Russian the child "said", which feeds the report) holds English: "I have to be in that", "Yo te amo",
  "Go to Lvovich", and even Mishka's own line "ты сказала целое предложение" (turn 31).
- **Fix:**
  - Only Cyrillic words count as `said_ru`.
  - Praise a sentence only when the child really said Russian. Otherwise model the Russian phrase and ask her to
    repeat it.

## 🟠 3. The lesson drifted away from the lesson
- Unit 2 (МА МО МУ, СА СО СУ) was taught at turn 1, then once by tracing (turn 27). The rest was chit-chat: money,
  dust, magazines, jellyfish.
- At 20:19 the parent asked: "Please help her to teach her language." The answer was a greeting.
- Model: `gemini-flash-lite-latest` on 35 of 38 turns (flash: 503 / timeouts). It also wrote Russian typos
  ("веетра", "бержир", "пересдал вопрос").
- **Fix:** every 3rd child turn, the server brings back the unit's target (say / trace a syllable), as Pere & Titi's
  class path does.

## 🟡 Smaller, not urgent
- **Hero voices:** Replicate 402 (no credit). Pere/Titi hero voices fall back to free voices, as before (Elena's money
  decision).
- **Claude:** "credit balance is too low" on 10 turns of espaluz-chat. It is tried first, fails, then Gemini answers.
  It wastes a call each turn.
- **Two names in one:** the fox calls itself "Лиса Алиса" while talking to the girl Alisa ("Lisa Alisa thinks…, Alisa?").
- **Pere & Titi, empty turns:** two parent turns arrived with an empty message (20:26). The heroes answered as if the
  parent had said something ("thanks for helping move to the next slide").
- **Pere & Titi, otherwise healthy:**
  - Spanish was heard correctly.
  - Traces da / ra / re were answered.
  - Photo read by free Gemini.
  - Titi's "you love sharks that cook" is his on-purpose silly mistake for the child to correct (she said on 3 Nov she
    does not like sharks).

## DONE 14 Nov ~21:45 UTC (Elena: "yes, do that") - ascent `6a988c6`, voice-to-text + kids-ru deployed, page PUBLISHED (live bundle sends context:"classroom_ru", verified); real-class proof still open

## Plan as approved
1. ascent `ClassroomRu.tsx`: send `language: 'ru'` + `context: 'classroom_ru'` to voice-to-text.
2. `voice-to-text`: Russian hint from the `classroom_ru` rows when `context` is classroom_ru (Pere & Titi unchanged).
3. `kids-ru`:
   - Cyrillic-only `said_ru`.
   - No sentence praise without Russian.
   - Unit target every 3rd child turn.
4. Test with recorded Russian audio before deploy. Prove with log lines `language: ru` and `said_ru=N` in her next class.
