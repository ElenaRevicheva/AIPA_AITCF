# Settling-in mode for Spanish speakers - diagnosis + plan (18 Nov 2026, waits on Elena's "go")

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
