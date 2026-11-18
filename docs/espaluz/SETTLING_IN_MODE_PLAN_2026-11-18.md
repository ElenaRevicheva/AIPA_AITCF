# Settling-in mode for Spanish speakers - diagnosis + plan (18 Nov 2026) - BUILT same day

Elena: "the Spanish speaker wants Spanish meaning and adaptation, not English meanings - our crucial defect?" Yes, for
that audience. Evidence: live readers 18 Nov (ES persona, Venezuelan father in Panamá): web chat 2/5, modules 2/5, would
NOT pay - "we already speak Spanish; focus on Panamanian adaptation and local words". EN and RU personas would pay.

## Diagnosis (checked in code)
The 21 country packs are NOT the problem: `_shared/belonging/panama.json` = ~22.7k chars of checked rhythm, greetings,
family/school life, holidays, food, "the words people really use" (ahorita, chuleta, xopá), newcomer pain. They reach web,
WhatsApp, Telegram. The FRAME is the problem - EspaLuz assumes every family is learning Spanish:
- questionnaire `learn`: Spanish / English / Both - no "I already speak Spanish" (FamilyProfileDialog.tsx ~l.125);
- every reply bilingual ES+EN, "1-3 Spanish phrases with English meanings" (bots espaluz_enhancements ~l.906; web prompt);
- bots translate the user's own Spanish message ("Recibí tu mensaje / I received your message");
- phrases saved as es + en (phrases.ts); dashboard "Your Spanish Journey", "Spanish Learning Modules";
- profileRules: HEART LANGUAGE gloss only for non-English/Spanish natives; meanings otherwise in English (RU reader too).

## Plan
1. Questionnaire 4th answer: "I already speak Spanish - help us settle in" (EN/ES/RU); learn = 'settle'.
2. ONE rule text (shared module, like brain_share.ts) for web + both bots: all-Spanish replies, no translation step, no
   beginner phrases; teach THIS country's words/customs/mentality from the checked pack in plain Spanish; bridge to
   country_from ("en Venezuela dirías..., aquí..."); English only if asked (English coach exists).
3. Phrase finder: also "palabra = significado" in Spanish -> "Palabras de aquí que has reunido".
4. Dashboard in settle mode: "Tu vida en <país>", country lessons first, basic Spanish modules hidden.
5. Kids' class unchanged (bilingual ES+EN fits a Spanish-speaking child).
6. Meanings in the family's own language for everyone (fixes the RU reader).
7. Readers again; bar = the Venezuelan father would pay.

## BUILT 18 Nov (Elena: "everything, but replies stay half Spanish half English - English is a must")
Reuses the existing engine, nothing rebuilt: the English coach (englishOnly) + the country packs + the BRIDGES rule, plus one
detector (settles / _settles, twin) and one SETTLING IN rule (twin, word for word in espaluz-chat and both bots).
- questionnaire 4th answer; also on for native language Spanish. Replies stay bilingual (Elena).
- brain: ascent `cc847de` (espaluz-chat v388); bots WA `26cb15e`, TG `b855739`, live md5 `c2959781`, restarted 14:38 UTC,
  backup `~/_session-backups/settling-in-20261118/`.
- dashboard (waits on Publish): `cc847de` + `2c89508` - welcome to your life in <country>, country lessons only,
  'Tu camino aquí', 'Español: nativo'. Every change = `settling ? new : old`, so other families see no change.
Additive check: every removed line was replaced by a version keeping the old one as the default (git diff -U0).
Proof (Venezuelan test family, deleted): web reply bilingual, school year March vs Venezuela's September, xopá, chuleta, real
English practice; both bots' prompts carry SETTLING IN, learning direction = english.
Reader (Venezuelan father, dashboard es): top half WOULD PAY (was no); class card 5, lessons 4-5. Still no on the bottom
half: 'Tu camino aquí' counts "Spanish words", the seeded test phrases were beginner ones; Russian class button/placeholder
shown to him (Elena placed it for everyone, 12 Nov). Raw: landing-tests/2026-11-18_settling-in-reader.json

## Menus (Elena: "add it to the WhatsApp and Telegram menus, additively - every line stays visible")
- Telegram: /settle added at the END (23 commands, all 22 old ones kept - getMyCommands checked); menu text + one line
  under /english · /spanish · /both; the typed words settle / instalarme / обжиться work too (TG `b474708`).
- WhatsApp: one menu line under "English, Spanish or both": "Already speak Spanish? type settle (or instalarme)" (WA `2cf46cb`).
- One switch (learn_switch, twin): bot record = english, shared profile = the 4th answer; kids-memory learn_set accepts it.
- Live md5: enhancements `0d6bd63d` (both), WA bridge `15826d7e`, TG main `a5db7173`; restarted 14:49 UTC; backup
  `~/_session-backups/settle-menu-20261118/`. Proof: test family, learn_set from the Telegram bot -> profile learn = settle.
Additive check: every replaced line is a list that gained one item (git diff -U0).
