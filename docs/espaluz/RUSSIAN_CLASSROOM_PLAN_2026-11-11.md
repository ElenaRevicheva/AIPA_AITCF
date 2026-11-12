# Bear & Fox Russian classroom - build plan (11 Nov 2026)

Approved by Elena 11 Nov. Built during the 14-day closed-test wait. Not in the Play listing until it works.

## Hard rule - Pere & Titi are not touched
- New page `src/pages/ClassroomRu.tsx` on its own route `/classroom-ru`. `src/pages/Classroom.tsx` is not edited.
- New edge functions only (`kids-ru` for the lesson, `voice-ru` for Russian voices). `espaluz-chat` (KIDS_* prompts),
  `generate-voice` (Pere/Titi voices) and their clips in `public/heroes/` are not edited.
- Own art folder `public/classroom-ru/`, own clips `public/heroes-ru/`.
- The only shared things are read-only: sign-in, the family list (`family_members`), the subscription check.
- Proof before every push: `git diff --stat` shows no Pere & Titi file.

## Who
- **Bear** - calm, slow, warm; Pere's role (the patient one). **Fox** - quick, playful, curious; Titi's role.
- **Names (Elena, 11 Nov): bear = Мишка Медок, fox = Лиса Алиса.** The fox shares the name of Elena's daughter on purpose.
  Rule for the lesson prompt: the fox ALWAYS calls herself by the full "Лиса Алиса"; the child is called only by her own
  name (from the family list), never "Алиса" alone in the fox's lines - so a child named Alisa always knows who is meant.
- Shown only to families whose heart language (questionnaire #3) is Russian, plus Elena.

## 12 Nov 2026 - CHANGED: bilingual Russian + English, adapted from Pere & Titi (Elena)
Elena: "all the features of the Russian classroom should be adapted from Pere and Titi - bilingual exactly like them"; pair = **Russian + English** (her choice over Russian + Spanish).
- Every line: Russian first, then the same idea in English - shown under it and voiced (voice-ru: Russian Azure voice, then an English one: Mishka en-US-GuyNeural, Lisa en-US-AnaNeural; secrets AZURE_*_EN_VOICE).
- Two ways in: **Поговорим / Let's talk** (Pere & Titi's lesson rhythm: hello+memory, wake-up game, 2 sentences, game, weekly forest story, calm, goodbye+mission) and **Урок / Class** (12 units, same themes/English/numbers as Pere & Titi's first grade, Russian letters in the bukvar order; two classes per unit).
- Brain break every 4th turn (Лиса), calm the turn after (Мишка); missions at the goodbye; memory of her own words + last mission from earlier lessons; parent report card on the page (unit, words she said in Russian, new words, mission).
- Turns saved as `learning_sessions.session_type = 'classroom_ru'` (Pere & Titi's rows never read). Dashboard: map step 3 button, website only.
- Code: ascent `2dbad9a` (kids-ru, voice-ru, ClassroomRu.tsx). Pere & Titi files: 0 lines changed.
- The section below is the ORIGINAL 11 Nov design (Russian only) - superseded where it conflicts.

## How it teaches (heritage speaker, not a beginner)
Child understands Russian, does not speak it (receptive bilingualism). Goal = SPEAKING, 5-10 min a day.
1. The heroes speak only Russian, short and slow; no Spanish/English translation unless the child is stuck.
2. Every turn asks the child to SAY something: name it, answer "что это?", finish the bear's sentence, retell.
3. Child answers in Spanish? Accept it, give the Russian version, ask her to say it back (recast, never "wrong").
4. Topics from her real life: family list names, school, Panama around her - plus Russian folk tales
   (Колобок, Теремок, Репка) and seasons of Russian nature.
5. Parent report after each lesson, same idea as Pere & Titi: what she said in Russian, new words.
- Age: 6-8 (confirmed by Elena 11 Nov).

## Look - Grok Imagine (Elena's X Premium; image first, then "Make video")
Style must match Pere & Titi's classroom (`public/classroom/classroom-c.jpg`): warm 3D animated storybook, soft golden
light, wooden textures, rich colours, cosy, no text.

**Style block (end of every prompt):**
> warm 3D animated storybook style, soft golden light, rich natural colours, cosy and inviting, detailed textures,
> child-friendly, cinematic depth of field, no text, no letters, no logos, no watermark, 16:9

1. **Classroom (empty):** a small cosy log-cabin classroom inside a Russian birch and pine forest; carved wooden window
   frames (наличники) painted in folk patterns; a big green chalkboard with a chalk drawing of a sun and a birch leaf;
   small painted wooden desks and chairs; a round woven rug with embroidered cushions; a shelf with a samovar, nested
   matryoshka dolls, wooden spoons with Khokhloma red-gold patterns and picture books; a string of embroidered fabric
   flags; through the windows white birch trunks, ferns and a meadow with daisies at sunset. + style block.
2. **Bear (character sheet):** a friendly young brown bear, round and soft, kind small eyes, gentle smile, wearing a
   red embroidered folk shirt (косоворотка) with a woven belt, sitting calmly in the forest classroom, holding a
   picture book. Front view, full body, plain warm background. + style block.
3. **Fox (character sheet):** a small lively red fox with a fluffy white-tipped tail, bright curious eyes, cheeky
   smile, wearing a blue sarafan-style vest with folk flower embroidery and a little scarf, standing on tiptoes mid
   gesture. Front view, full body, plain warm background. + style block.
4. **Together (cover):** the bear and the fox side by side in the forest classroom from prompt 1, the bear waving
   slowly, the fox jumping with joy, looking at the viewer as if greeting a child. + style block.
Clips to make from the cover (5-8 s each): hello wave (both), bear talking, fox talking, bear listening, fox listening,
fox cheer, bear thinking, goodbye wave. Same list as Pere & Titi so the page logic can mirror theirs.

## Voices - free first
- Browser's own Russian voice (fallback) and Azure F0 Russian neural voices (bear: a low calm male voice, e.g.
  ru-RU-DmitryNeural, slower rate; fox: a light quick voice, e.g. ru-RU-DariyaNeural, higher pitch). Shares the Azure
  F0 monthly allowance with EspaLuz (~1,140 turns/month measured 10 Nov) - watch it.
- Replicate MiniMax character voices only if Elena tops up after hearing the free ones (~$0.40-0.80 per lesson by the
  code's own note; $10 = about 12-25 lessons).
- Speech-to-text: the existing `voice-to-text` already accepts Russian (read-only use, language hint "Russian").

## Order of work
1. Elena: names + Alisa's age; makes the 4 Grok stills (prompts above) -> drop into `docs/espaluz/russian-classroom-art/`.
2. Claude: `/classroom-ru` page shell with the classroom art + `kids-ru` lesson function (free LLM waterfall) + `voice-ru`.
3. Alisa's first 10-minute lesson -> parent report -> adjust.
4. Clips (Grok "Make video") -> wired like Pere & Titi's.
