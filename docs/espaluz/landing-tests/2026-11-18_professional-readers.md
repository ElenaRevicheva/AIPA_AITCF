# Professional readers on the LIVE product (18 Nov 2026, evening)

Elena: "make them truly professional and human-like, so I see whether crucial defects are left."
Readers = a real parent persona AND a senior consumer-product reviewer; only crucial/major defects, with evidence and a fix.
Rounds: landing (scripts/landing-agent-test.cjs, live) · dashboard (live bundle index-DLmO3PB9, EN Jennifer / RU Marina /
settling ES Carlos) · two real conversations through the live brain (Ana: school note -> 'Sí, es mi hija' -> CSS vaccines ->
Sofi's class -> thanks; Carlos settling: Panama vs Venezuela, 'chuleta', English interview). Test families deleted.

Landing: PASS (EN 4, ES 4, RU 4); all would tap "Try 20 messages without an account".

## Not defects (test set-up)
- "Called me Ana": the test family's parent IS Ana. - "14 trial days on day 2": account made minutes before.
- "[VIDEO SCRIPT END] leaked": the transcript tool cut differently; the app strips stray tags (ChatWithEspaluz.tsx l.51-52).

## Fixed at once (ascent fb1a2d5, waits on Publish)
- lessons showed "0 words" (looked broken) -> hidden when 0
- chat box offered Russian on EN/ES pages -> "Spanish or English" (RU page unchanged)

## Real, open - Elena's call
1. SETTLING families: face-to-face practice runs in Spanish with English below - Carlos wants it IN ENGLISH (his goal: an
   English job interview). Biggest gap for that segment.
2. SETTLING families: Panama lessons still tagged "Principiante" and open with basic greetings.
3. RUSSIAN families: meanings, practice notes and the chat welcome are Spanish+English, not Russian (vs. the bilingual
   ES+EN rule - a product decision).
4. Plan card: "Continue for $11 a month" during the trial - unclear whether paying now ends the trial (verify billing first).
5. "Video moments" card: celebrations + practice + family world + privacy text crowded; privacy text reads as confusing.
6. "Your first year": Carnival / summer show "When it comes" - could show the usual month (never a moving date as fact).
Best-rated: Sofi's class card, phrases collected, Panama first-year path, CSS-visit guidance, the school-note handling.

## Follow-up the same evening (Elena: "fix the settling points")
FIXED (ascent `1cfdcd4`, `22ce7e9`; brain deployed; web WAITS ON PUBLISH):
- settling families rehearse IN ENGLISH (EspaLuz plays the interviewer in English, Spanish below, corrects their English;
  voice listens in English). Proven: 'ingeneering'/'responsable' corrected; ordinary families still rehearse in Spanish.
- settling families: Panama lessons in one list, no level tabs/badges, local expressions first, greetings lesson hidden.
- settling families: chat welcome = "life here + practise your English".
Carlos re-read: top half went to WOULD PAY / trust 4 once, then trust 3 on the next run (the reader varies run to run).
Left - PRODUCT DECISIONS, not bugs:
- collected Panama words show an ENGLISH meaning (bilingual rule; Carlos would like the nuance in Spanish too)
- for a native speaker "slang + calendar alone" is not $11 - the English track must feel structured (a weekly English plan?)
- the chat's voice-language box shows "Español" (it is the voice-recognition language, read as "Spanish tutor")
- practice scene input placeholder is cut off on a phone
