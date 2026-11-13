# EspaLuz car mode: competitors and the proposal (13 Nov 2026)

Elena's ask: Alisa's tablet has no SIM; families on the road spend hours in the car between errands. EspaLuz must keep
teaching with no internet. No new paid machinery, no reinvented parts. Research first, then the proposal.

## What competitors do offline (web research, 13 Nov 2026; self-reported claims, not tested by us)

| App | Offline | How | Limit |
|---|---|---|---|
| Babbel | Yes | Download a unit; progress syncs later ([support](https://support.babbel.com/hc/en-gb/articles/19176178120722-Offline-mode)) | Fixed course lessons |
| Lingokids (kids) | Paid tier only | Tap download per activity; Downloads tab ([help](https://help.lingokids.com/hc/en-us/articles/212078109-Can-I-use-Lingokids-offline)) | Plus subscribers only |
| Duolingo | Partial | Selective download of the current path (third-party sources only) | Cannot pick units |
| Mondly Kids | Listed as offline ([roundup](https://abblino.com/best-language-learning-apps-for-kids-september-2025)) | Downloaded lessons | Generic content |
| **Pimsleur** | Yes | Audio lessons downloaded + **hands-free driving mode**, CarPlay / Android Auto ([App Store](https://apps.apple.com/us/app/pimsleur-language-learning-app/id1405735469), [review](https://storylearning.com/blog/pimsleur-review)) | Audio course, not personal |
| Buddy.ai (kids) | Mostly no | Cloud speech + AI; reviews say a stable connection is needed ([listing](https://aichief.com/ai-education-tools/buddy-ai/)) | — |
| SpeakLocal / EdgeLingo | Yes, live AI chat | On-device model, ~3 GB download (Gemma) ([Play](https://play.google.com/store/apps/details?id=com.speaklocal.speaklocal&hl=en_US), [EdgeLingo](https://edgelingo.com/)) | Heavy, adult-only, no Spanish-for-families |

**Not available to us:** Chrome's on-device AI (Prompt API / Translator API) does not run on Android Chrome
([Chrome docs](https://developer.chrome.com/docs/ai/translator-api)); our Play app is a Trusted Web Activity on Chrome,
so free in-browser offline AI is not an option today. On-device speech recognition (`processLocally`) is documented for
desktop Chrome/Edge ([MDN](https://developer.mozilla.org/docs/Web/API/SpeechRecognition/processLocally)), not confirmed on Android.
A 3 GB on-device model on a child's tablet is not a fit either.

**The pattern:** offline = pre-downloaded *generic* lessons. The one genius idea in the market is Pimsleur's
**hands-free audio for the car**. Nobody found ties offline content to *this family's own day* (today's errand, this
week's school topic) in two languages, for parent and child together.

## The proposal: "EspaLuz on the road" - built only from what exists

Every piece reuses something already live. New code = one service worker + one small offline store + one player screen.

1. **The app opens with no signal.** Service worker keeps the app shell, the hero clips (`public/heroes`,
   `public/heroes-ru`) and paint/trace pages. Offline it shows "On the road" instead of Chrome's error.
2. **Every lesson heard at home travels with you (record and replay).** The classroom already receives each line's
   text (`espaluz-chat`) and voice (`generate-voice` / `voice-ru`). The tablet keeps a copy of the last lessons it
   played. Zero extra generation cost.
3. **Hands-free road lessons (the Pimsleur idea, for a child).** In the car, a lesson plays as audio: hero says the
   Spanish line, pause for Alisa to repeat, English meaning, next line. Big buttons, no reading needed (motion
   sickness). Uses the saved lines and voices from step 2; the timing is plain code.
4. **"Hear yourself" without AI.** Offline there is no pronunciation grading, so the tablet records the child's
   repetition on the device and plays it back next to the hero's line (MediaRecorder works offline; recordings never
   leave the tablet). Honest and fun.
5. **Today's errand pack for the parent (the unique part).** Before leaving home the parent taps the errand
   (school, doctor, bank, migración, market). EspaLuz saves that topic's CHECKED lines from the family's belonging pack
   (`belonging/<country>.json`, already used by both bots) plus key phrases, with voice, bilingual. Works in a queue
   with no signal. Built from existing packs; no new facts.
6. **Progress waits, then syncs.** Offline activity is queued on the device and sent through the existing
   `submit-progress` / `learning_sessions` path when Wi-Fi returns.

**Honest promise for the listing:** "Your last lessons and today's errand phrases travel with you - no Wi-Fi needed."
Not promised: live AI conversation or pronunciation checking offline.

**Order:** 1 → 2 → 3 (one update during the 14-day closed test, a real "we listened and improved" answer for Google's
production questionnaire), then 4 and 5.
