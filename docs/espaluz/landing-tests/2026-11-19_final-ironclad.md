# Final ironclad evaluation - landing + every dashboard feature (19 Nov 2026)

Elena: "check absolutely everything - the whole landing, each fact for its truth, the dashboard, every feature, every
button, every clickable link". Everything ran on the LIVE site (after her Publish) with 3 test families (EN expat, ES
settling, RU), deleted afterwards. Every reported defect was verified by hand before it counted.

## 1. Dashboard - every button, clicked (fresh page each)
EN 49 / ES 30 / RU 31 controls. 0 page errors, 0 failed server calls. "Could not click" = icon-only buttons and hidden
copies (robot limit); "Start practising" / "Make EspaLuz's wish" are disabled until a scene / photo + occasion is given
(by design) - so the core features were then USED by hand, all three languages:
| Feature | EN | ES | RU |
|---|---|---|---|
| Chat answers a real question | PASS | PASS | PASS |
| Rehearsal: scene -> first question -> answer -> reply, with voice | PASS | PASS | PASS |
| Wish: photo + occasion -> honest "opens with EspaLuz Family" for a trial (no paid clip) | PASS | PASS | PASS |
| Chat reads a photo | PASS | PASS | PASS |
| Listen (phrases) = the phone's own Spanish voice, by design (17 Nov) | PASS | n/a (no phrases yet) | n/a |
| Microphone refused -> "Could not start recording. Please check that the microphone is allowed." | PASS | | |

## 2. Zero-tolerance feature readers (145 feature screens)
135 PASS, 10 FAIL -> 3 issues, verified: (a) "Record" did nothing = no microphone in a test browser (the refusal message
works) - not a defect; (b) **"Continue for $11 a month" landed mid-page, the prices 3,683 px below - REAL, FIXED**:
the landing now goes to "#pricing" once it exists (fixes all 4 in-app price links); (c) **language button "usEnglish" -
REAL, FIXED**: EN/ES/RU codes (Windows cannot draw flag emojis).

## 3. Landing - every link and button (all folds open)
46 distinct controls: 30 PASS directly incl. every outside link (WhatsApp, Telegram, PayPal...); the other 16 checked one
by one = hidden phone copies, one-open-at-a-time rows, forms waiting for input, sound-only, disabled "Coming soon".

## 4. Landing - every fact checked for truth (47 claims)
All backed by the code: 12 class units (KIDS_CLASS_UNITS), 21 countries (PACK_COUNTRIES), 20 guest messages
(FREE_MESSAGE_LIMIT), a sticker every 5 stars, the daily game together (TOGETHER), monthly video caps, $11 / 14 days /
no card, pagar & /pagar, channels, voice/photo/RU. Soft only: "a few videos each month" undersells the cap.

## 5. Strict readers (live, round 3) - FIXED: pricing heading "Empieza hoy tu camino con el español" contradicted the
"Ya hablamos español" path -> "Spanish, English or both" (EN/ES/RU).

## 6. Andy's advice (Ketzai, 15 Nov) - did we follow it?
| Andy said | Status |
|---|---|
| Not clear in the first minute - too much text | PARTLY. Phone first screen = 32 words; in Andy's own test (first screen + first 300 words) Jennifer, nomads, Marina got who/what right, clarity 4/5. Carlos + Valentina (native speakers) 3/5 "not for me - close the tab": their door ("Find your family's path") is below the first 300 words. Whole page: ~1,050 visible words (2,200 with folds open). |
| Test with agents as humans: can they get it in 200-300 words? | DONE today, exactly this test. |
| Every word must carry weight | NOT YET. Readers named the dead weight: "still searching for their place", "English that grows with your family", "Hear EspaLuz say hello", "Real learning instead of cartoons". |
| PostHog (time on page, behaviour, conversion) | NOT DONE. The site has GA4 only. |

## For Elena (not changed - her call)
1. Lift "Find your family's path" into the first screen (native speakers close the tab before reaching it).
2. Cut the dead-weight phrases above (Andy).
3. First screen: a real picture of the kids' class instead of the AI portrait (3 readers asked "what does it look like?").
4. PostHog (free tier) - needs the privacy page + consent updated.
5. Payment card: "Merchant ID ..." + "Step 1/2 PayPal onboarding" text (3 readers: technical, suspicious); PayPal-only.
6. Russian under rehearsal questions (Marina).
