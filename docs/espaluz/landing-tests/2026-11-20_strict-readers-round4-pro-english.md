# Strict readers, round 4 — landing + dashboards + Pro English (20 Nov 2026)

Elena: "run again a bunch of critical, strict, human-like readers along all the landing page and all the dashboard with all
its layers, including our Loora-like coach deployed today."

**Method.** The LIVE site (app.espaluz.lat, after today's publishes), phone width. 6 readers = the 5 Table 2 families
(Jennifer, Lukas & Bia, Carlos, Valentina, Marina) + NEW **Andrés** (29, native Panamanian hotel receptionist, not moving,
wants an English-only work coach like Loora/Praktika). Each read the landing in their language with THEIR path card opened,
then a signed-in page: dashboards of 3 temporary test families (EN/ES/RU) and `/pro-english` after one real message to the
coach. 23 reads, strict mode (crucial/major only, evidence required), Gemini via the free-first waterfall on Oracle.
Tools reused from the 19 Nov round (`strict-readers.cjs`, `reader-shots.cjs`, `plan-test.mjs`; session scratchpad).
Test families deleted afterwards (auth users left: 0). **Every reported defect was checked by hand against the code/data.**

## Scores
| Reader | Landing (part 1 / part 2) | Signed-in page |
|---|---|---|
| Jennifer (US, Panamá) | 4 pay / 4 pay | dashboard 4 pay / 3 pay |
| Lukas & Bia (nomads) | 4 pay / 4 pay | dashboard 4 pay / 4 pay |
| Carlos (VE, settling) | 4 pay / 3 no | dashboard 3 no / 4 pay |
| Valentina (AR, single mum) | 4 pay / 4 pay | dashboard 3 no / 4 pay |
| Marina (RU) | 4 pay / 4 pay | dashboard 3 no / 4 pay |
| **Andrés (PA, Pro English)** | 3 no / 3 no | **`/pro-english`: 4, would pay, no defects** |

Pro English itself passed: "a focused, on-demand English business coach that immediately corrects my grammar and gives
role-specific answers for work without forcing unwanted Spanish tutoring." The "no" votes come from the landing and the price.

## REAL — fixed now (ascent, this commit)
1. "Your plan includes … see and correct it in **card 7** of your map" — memory is card **8** (7 steps + the memory card). EN/ES/RU.
2. ES start section still said "Elige el canal que **tu familia** ya usa" (the ES key existed, so yesterday's fix skipped it) -> "Elige el canal que ya usas".
3. Pro English card read as a contradiction ("English-only … or in Spanish") -> "A coach who speaks only English with you … you may write in Spanish when stuck … always get correct English back". EN/ES/RU.
4. "a Costa Rican in Panama" read as hard-coded -> "for example, …". EN/ES/RU.

## REAL — Elena's call (nothing changed)
- **The $11 card does not say Pro English is included** (Carlos crucial, Andrés crucial, nomads). Fact: Pro English runs on the same trial/plan. Proposal: one line in "What's included": "Pro English: an English-only coach for work".
- **Andrés: the whole landing speaks to families moving abroad**; no Pro-English-only plan. `/pro-english` is its own door already; a separate price/plan is a business decision.
- **$11 card next to "14 days free" still confuses** (Valentina, Marina) — same as round 3; one line was added then.
- **Step 2 chat screenshots are English→Spanish** (Valentina) — same open item as round 3 (needs real Spanish-side screens).
- **RU face-to-face prep shows English translations, not Russian** (Marina).

## REJECTED (checked)
| Reported | Why not real |
|---|---|
| "0 days / 0 conversations" vs a rehearsal in the week (Carlos, Valentina, Marina) | the counter counts chats/classroom only; the test families had no chats — true zeros. (Note: rehearsals and Pro English turns are not counted there — by design today.) |
| "Trial 14 days after a week of activity" | test accounts created today with back-dated activity |
| "Parent Parent", only one adult | test-family name "Parent", one adult seeded |
| "First year blocked until country is set" | test profiles had no country; real users set it in card 1 |
| "Phrases to keep" empty vs "Phrases you've collected (2)" | test row had a phrase list but no reply text; real web-chat rows carry the reply (9 of 10 in 30 days) |
| "Russian card isolated at top of a column" | the 3-column cut of the screenshot |
| "PayPal only" | PayPal takes cards; PágueloFácil/Play stay (Elena: never hide) |
| "Мишка & Лиса unexplained" | the card says what it is (beta, Russian-English class) |
| Placeholder "…en un hc" truncated | the text is "…en un hotel el jueves"; cut by a narrow input only |
| Family chat should toggle to Pro English | the family chat is bilingual by design; Pro English is its own page |
