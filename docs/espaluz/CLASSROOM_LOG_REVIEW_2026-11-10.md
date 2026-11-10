# Kids classroom: production log review, 10 Nov 2026

Source: Supabase project logs (`function_edge_logs`, `function_logs`) and `learning_sessions` rows, read 17:56 UTC.
Window: 17:20–17:56 UTC. One sitting of about 30 minutes: **31 lesson turns, 17:23:52–17:53:35 UTC, one web account.**
This repo is public, so the child's words are not quoted here. No code or settings were changed by this review.
Why it matters now: the Google Play closed test (12 testers × 14 days) starts from this classroom, and a reviewer sees what she saw.

## Reliability: clean
| Function | Calls | HTTP | avg / max time |
|---|---|---|---|
| `generate-voice` | 107 | all 200 | 5.8 s / **29.0 s** |
| `espaluz-chat` | 70 | all 200 | 2.1 s / 14.5 s |
| `voice-to-text` | 40 | all 200 | 0.7 s / 3.5 s |
| `kids-memory` | 12 | all 200 | 0.4 s |
| `payment-mirror` | 12 | all 200 | 0.6 s |

Zero 4xx/5xx. Groq Whisper transcribed every clip. Unit stayed at **Unit 5** all session; the 5 Nov "every press advances the
unit" bug did not reappear. The "Entiendo que…" tic from 5 Nov is gone (0 of 31). One turn was correctly flagged as the parent speaking.

## What went wrong (from the logs)
1. **Pere and Titi changed voice in the middle of the class.** Replicate (their real voices) still `402 Insufficient credit`.
   Free Gemini voices are capped at **10 requests per day per model**; 30 lines failed `429` on all three Gemini models and fell to Azure.
   Result: Pere spoke 20 lines in Gemini's voice and 17 in Azure's; Titi 13 and 13. A child hears two different Peres in one class.
   Each of those 30 lines also first waited for three failing Gemini calls before Azure answered (part of the 29 s worst case).
2. **Claude is still first in the chain and fails every turn:** 19 text turns + 9 photo turns `credit balance is too low`.
   Text then fell to Gemini-lite (25) or Groq (6); 7 Gemini timeouts added waiting.
3. **All 9 photos were read by Grok (paid xAI credit),** because Claude is dry and there is no free vision step before Grok.
4. **The energy break took over the lesson.** The same fixed line ("Pausa de energía, 20 segundos…") appeared in **6 of 31 turns**
   (17:28, 17:36, 17:40, 17:44, 17:46, 17:51). Three times it replaced the closing question, and at 17:46 it was the **only** reply:
   she had just corrected the heroes about a photo and got no answer to it.
5. **The unit goal was barely taught.** Unit 5 target: syllables with d and soft r, sounds h/b/f/l, counting by 2s.
   Counting by 2 appeared twice (apples, legs). Syllables: 0 of 31 turns. Repeat-after-me: once. The heroes followed her topics
   (photos, toys, family) well, but never steered back to the syllable work.
6. **Photo replies guess and get corrected.** Twice the heroes stated something false about a photo (a drink, a toy that flies) and she corrected them.
   The vision reply invents details beyond the caption.
7. **6 of 31 turns end with no question**, so the child does not know it is her turn.

## What went right
She stayed 30 minutes, spoke full Spanish sentences unprompted, sent 9 photos of her own things, corrected the heroes in Spanish,
and the heroes built on her toys and drawings. This is the companion behaviour the niche promises.

## Suggested order (nothing done; each is Elena's go)
1. **One voice per hero for the whole day.** When Gemini returns the daily `429`, skip Gemini for the rest of the day (circuit breaker)
   so every line comes from Azure; or put Azure before Gemini for heroes. Free, removes the voice flip and most of the 29 s wait.
2. **Skip Claude while it reports no credit** (same circuit breaker, re-check hourly). Free-first rule; also cuts latency.
3. **Energy break: at most once per class, never as the only line, never replacing the question.** Code-side, in the classroom script.
4. **Steer back to the unit every ~4 turns** (one syllable or sound mini-game tied to her topic: "arrodón" → ra-ro-ru).
5. **Photo replies: describe only what the caption says,** ask instead of guess.
6. Free vision before Grok (Gemini vision) so photos stop spending xAI credit.
7. Replicate top-up brings the real hero voices back (money, Elena's call).

Google Play note: photos taken in the child's home go to xAI (and Claude when funded). The Data safety form must match what
actually leaves the device; check it lists photos processed by service providers before the closed test.

## Thinking it through before fixing (with Elena, 10 Nov)
The question for each finding: is it caused by having no money, or by how the free resources are arranged?

| Finding | Needs money? | Real cause |
|---|---|---|
| 1. Voice flips mid-class | Only for the *real* hero voices (Replicate) | Free voices are tried in the wrong order. Gemini gives 30 lines a day in total (10 × 3 models) for **all** families together, so with 12 testers it is a few lines of a morning, then a flip. Azure is the voice Elena chose by ear on 8 Nov. One free voice per hero for the whole class is honest and stable. |
| 2. Claude first with no credit | No | Order of the chain. Against the free-first rule. Pure delay. |
| 3. Photos paid via Grok | Grok costs; a free reader exists | No free photo step before the paid one. Also privacy: photos taken inside a child's home. |
| 4. Energy break takes over | No | Script logic. Worst case: the child speaks up and is not answered. |
| 5. Unit goal not taught | No | Prompt does not steer back to the unit. This is the product's main promise. |
| 6. Wrong guesses about photos | No | The photo reader adds details. Her correcting the heroes in Spanish is good learning, so keep the effect deliberately ("Titi gets it wrong, you fix it"), but only if the next reply answers the correction (see 4). |

**Five of six are free.** Lack of money explains one thing: the heroes do not have their *original* voices. It does not explain the rest.

**Honesty for the closed test (12 testers × 14 days):** do not hide that EspaLuz runs on free tiers. Say it once, plainly, in the tester invite
and Play listing: built by one parent; during testing the heroes use standard voices and replies can take a few seconds; feedback shapes it.
Do not promise anything the testers will not get (e.g. "the heroes' own voices"). What looks like a scam to a reviewer is a claim the app
does not keep, not a small budget.

## Fixed 10 Nov 22:34 UTC (ascent `8f413fa`, live = commit, downloaded and diffed)
Everything below uses pieces that already existed; nothing new to pay for.
- **One voice per hero all day:** heroes speak Azure F0 first, Gemini behind it. Live call 22:38 UTC: `voice spoken by azure-pere`,
  `azure-titi`, no Gemini refusals first, 2.0 s and 2.5 s (today's average was 5.8 s). Revert without code: secret `FREE_HERO_VOICE_ORDER=gemini,azure`.
- **Photos:** Claude -> free Gemini (the no-billing key text already uses) -> Grok. Prompt says only what is clearly visible. *Not yet seen live: proof = `photo read by gemini` on her next photo.*
- **Energy break:** the same line every time was a bug (the base prompt named "cross-crawl", so every break matched it); now the planned break rotates.
  The answer to her always stays, the turn ends with a question, and no break on a correction or photo turn.
- **Unit goal:** SOUNDS BRIDGE every 4th turn (offset from the break) until the unit's syllables were shown, built from her own topic; enforced in code if the free model skips it.
- **Corrections:** agree, say the right version in both languages, no game.
Checked: type check has the same 6 old errors and no new ones; the new regexes tested on today's real turns (3 corrections caught, 5 ordinary turns not).
**Still needs money (honest note for testers): the heroes' original Replicate voices.** Claude dry costs one fast refusal per turn (left as Elena's 31 Oct "paid first" design).

## Syllables, 10 Nov 22:50 UTC (ascent `09ad3b0` + `9783424`, live = commit)
- Elena caught a teaching error: "ra, ro, ru" from *arrodón* is the **strong rr** (a-rro-dón); Unit 5 is the soft r (pe-ro, ca-ra).
  The sounds bridge now says so and takes the d syllable (dón) from such words instead.
- Elena: every syllable, as bilingual schools teach from kinder. The 12 units now cover every Spanish syllable family in the usual
  syllabic-method order: vowels, m p, s l, t n, d + soft r, c q g + gue gui, f b v + j ge gi, ll ñ ch + y + silent h,
  strong rr + z ce ci, blends (trabadas), reverse syllables (inversas), k w x + güe güi. Same 12 units and themes, so Alisa stays on Unit 5.
  The exact MEDUCA list is still unconfirmed (see KIDS_CLASS_PATH_1ST_GRADE_DRAFT.md); this is the common order, not a cited syllabus.

## Photos, 10 Nov 23:41 UTC (ascent `8ace78a`, live = commit)
Elena: the free photo reader already exists in the fleet. It does: VibeJobHunter `scripts/judge_feedback_sync.py` `_read_screenshot`
(free Gemini -> Groq `qwen/qwen3.8-27b` vision -> Grok -> paid), reading her job screenshots since 1 Nov. The classroom now uses the
same order: **free Gemini (lite, flash) -> Groq qwen vision (free) -> Claude -> Grok.** Paid readers only when both free ones fail.
*Not yet seen live: no photo since the deploy. Proof = `photo read by gemini` or `photo read by groq` on the next photo.*
Twin still open: the Telegram and WhatsApp bots' `process_photo` is still OpenAI -> Grok (both paid).
