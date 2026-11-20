# "Our own Loora" inside EspaLuz — professional English for Panamanians (20 Nov 2026) — WAITING ON ELENA'S GO

Elena, 20 Nov, after meeting Michael (Panamanian English coach): Panamanians need professional English now (US, Canadian and
European investors arriving; bilingual = better jobs). They want Loora-style coaching. Build it ONLY if it is additive on the
existing engine, no rebuild. Earlier fit check: `docs/espaluz/LOORA_MICHAEL_FIT_2026-11-20.md`.

## What already exists (checked in code today) — roughly 80% of a Loora
| Loora piece | EspaLuz today | Where |
|---|---|---|
| Role-play a real scene (job interview, meeting, call) | YES, in ENGLISH for Spanish speakers since 18 Nov (after Carlos) | ascent `espaluz-chat/index.ts:1848` `PRACTICE_ROLE_EN` + `PracticeMoment.tsx` (web) |
| Speak instead of type | YES: web voice-to-text (Gemini), WhatsApp/Telegram voice notes (Groq Whisper -> OpenAI), hint "Spanish and English" | `voice-to-text`, `espaluz_bridge.py:2019` |
| Coach answers out loud | YES: English voice en-US-JennyNeural on the bots, generate-voice on web | `espaluz_neural_tts.py:57` |
| Corrections "Better: ..." + 1 reason | YES, max 2 per reply | `englishRules()` index.ts:291 + bot twins `_english_only` |
| Work English (emails, calls, interviews) | YES, goal-based rule | index.ts:282 |
| Feedback after a rehearsal: did well / fix / phrase to keep | YES, saved; optional lip-synced tips video | `PRACTICE_TIPS_EN` |
| Memory of the person across web/WA/TG | YES (family notebook) — Loora's memory is per-app | |
| **English-first replies (immersion)** | NO — every reply is forced bilingual | `BILINGUAL, ALWAYS` :145, `BILINGUAL_LAST` :1619, 2 bot twins |
| **A door for a local Panamanian** | NO — the path is worded "settling into a new country"; heart-language Q3 has no Spanish button | `FamilyProfileDialog.tsx:72,131` |
| **Pronunciation score** | NO | — |

## The build, additive, in three steps
1. **Pro English mode (~1 day, the real switch).** One new answer to "What do you want to learn?": *Professional English — I speak
   Spanish* (+ Spanish button on Q3). It turns on: replies **in English first**, Spanish only as one short line for a correction or a
   hard word; the English coach + work-English rules; the English rehearsal on the web; no country-settling talk unless asked.
   One profile flag, one prompt block that overrides the bilingual rules, mirrored in web + WhatsApp + Telegram (twins). Families
   keep everything exactly as today.
2. **Pronunciation feedback (~1-2 days, optional).** Azure Speech *Pronunciation Assessment* on her existing free Azure F0 account
   (same account as the voices; F0 trial ends ~7 Dec — upgrade is her call): score + the 2 worst words on web rehearsals and WA
   voice notes. Only after step 1 has real users.
3. **The door (marketing, not code).** A Spanish page/section "Inglés profesional para Panamá" with a tracked link, offered first
   through Michael (referrer or pilot coach for his students). Same 14-day free trial.

## What we do NOT build
Live real-time voice calls (Loora's phone-call feel) — new infrastructure, not additive. A separate app or brand.

## Risks
- Contradicts the 6 Nov rule "grown-up replies stay bilingual" — this mode is opt-in only, families untouched. Elena decides.
- Positioning: EspaLuz's niche is families in a new country; Pro English is a second door, not a replacement.
- Proof before claims: no public copy about "pronunciation scoring" until step 2 is live and verified.
