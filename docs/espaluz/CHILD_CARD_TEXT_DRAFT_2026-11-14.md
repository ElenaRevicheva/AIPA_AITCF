# "For your child, ten minutes a day" card text (14 Nov 2026) - APPROVED by Elena, applied en/es/ru

Why: Elena: the middle card "looks empty" next to the other two cards. Enrich it with real facts, no repeats.

## Now (32 words)
Pere & Titi's voice classroom (ages 6-7): Spanish and English school skills that keep up with the local school, and a
one-minute report for you after every lesson.

## Proposed (about 75 words, same length as the other two cards)
Pere & Titi's voice classroom (ages 6-7) walks a path of 12 school units, from "Me and my family" to "My friends",
in Spanish and English. Your child talks with the two heroes, traces letters and syllables, paints, plays music and
games, and can show a photo of a drawing or homework. Every five stars bring a new sticker, and when energy drops,
Titi calls a short movement break. After every lesson you get a one-minute report.

## Every line is in the code (no promises we cannot show)
| Claim | Where it lives |
|---|---|
| 12 units, "Me and my family" ... "My friends", Spanish + English sounds | ascent `supabase/functions/espaluz-chat/index.ts` KIDS_CLASS_UNITS (lines ~403-414); classroom shows "Unidad X de 12" |
| Talks with Pere & Titi (voice) | `src/pages/Classroom.tsx` |
| Traces letters and syllables | TracePad; the unit sends its letters/syllables to trace |
| Paints | PaintPad ("Paint" button) |
| Music and games | MusicPad, GamesPad (opened from the classroom pads) |
| Photo of a drawing or homework | "Photo" button; photos are read for free first |
| 5 stars = a sticker | Classroom.tsx: every 5 stars Titi dances + next sticker |
| Movement break when energy drops | Leaply method, live-verified 3 Nov ("¡Pausa de energía, 20 segundos!") |
| One-minute report after every lesson | already on the card today |

## Not repeated from elsewhere on the page
- "talk, read, trace letters and earn stars" is in the founder card (creator.m3): kept short here, new detail added (units, paint, music, photo, break).
- "Shy children practise through play" (lp.l4b) and the pricing line "voices, games, stars & stickers" (pr.fam1) are not copied.
- Not claimed: ages 3-5 / 8-10 (pricing "coming" items), "same as first grade at the local school" (not verified).

## After Elena's OK
Same text in es and ru (hero4.card2), build, 360/412/768/1280/1600 check, push ascent, Lovable Publish by Elena, verify live.
