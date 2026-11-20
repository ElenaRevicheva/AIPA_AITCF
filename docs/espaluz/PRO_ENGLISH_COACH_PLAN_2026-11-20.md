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

## Avatar: Loora vs EspaLuz (checked 20 Nov)
- **Loora** (support page loora.com/support/features/avatar-feature): a small video window "during Classic and Read and Talk
  lessons"; role-play lessons have NO avatar ("chat only"); can be hidden. The page does NOT say whether the lips follow the speech,
  nor the vendor, nor if it is paid-only. Unverified either way.
- **EspaLuz already has the real thing, as clips:** "See EspaLuz" in the web chat = Runway, one photo + our own voice -> photoreal
  lip-synced clip (`generate-video`, avatar id in env). Paid subscription only, 30 clips/month, wallet floor guard. By design
  (6 Nov) the clip says a short true note, never repeats the reply. Also: practice tips as a clip (2/month), celebrations (1/month).
  First real clip 6 Nov, log `[talking] clip started ... used=1/30`.
- **What is a loop:** during the face-to-face rehearsal and in the classroom, her clip loops with the sound off while her voice
  plays - no live lip-sync engine, and the code says so.
- **Not built:** a LIVE talking face that lip-syncs every reply in real time (a video call). That is new infrastructure and credits
  per minute - not additive. A middle step is possible later: the rehearsal's final tips are already a real lip-synced clip.
- **Spanish button on Q3:** pushed ascent `8047e99` 20 Nov; live only after Lovable Publish.

## ✅ ELENA'S DECISION 20 Nov (supersedes "Step 1" above): a SEPARATE layer, nothing existing edited
- **Who:** NATIVE Spanish speakers (Panamá, Costa Rica, any LATAM) learning PROFESSIONAL English to earn: serving English-speaking
  clients, remote jobs, business travel. NOT the existing "I already speak Spanish" path (that one can be a non-native) — it stays
  exactly as it is, and so do bilingual replies, families, classroom, every current mode.
- **No avatar.** Loora-style = listen, correct, answer in English, by text and voice. The Runway clips stay a family feature.
- **Own door:** its own entry (own tracked WhatsApp/Telegram start code + own Spanish page "Inglés profesional"), its own profile
  flag (`track: pro_english`) that no existing question can set.
- **One turn:** user speaks (voice note / mic) or types, in English or Spanish -> existing transcription -> NEW coach prompt:
  (1) "Better: ..." their sentence fixed, (2) the coach answers and keeps the conversation going in English, (3) one short Spanish
  line only when they are stuck -> English voice reply (existing en-US voice).
- **Scenarios for money:** client call, quoting a price, customer service, remote-job interview, small talk with expats/investors,
  business trip (airport, hotel, meeting), professional email. Short level check first; weekly progress.
- **Code shape:** all new files (coach prompt, scenarios, level check). The ONLY touch to existing code is one routing line at
  each entry point: `if track == pro_english -> new coach; else -> unchanged`. WhatsApp first (where Panamanians are), then web, TG.
- **Effort:** ~2 days for WhatsApp + web with production proof; pronunciation score (Azure) later, optional.

## ✅ BUILT 20 Nov (Elena approved: separate layer + Azure + Runway clips as paid extra)
- Brain: ascent `supabase/functions/_shared/pro_english.ts` (`a978374`, `bd0b8d8`), doorway in espaluz-chat (import + bot auth + branch).
  Live proof: guest run on the deployed brain - level check -> A2, scene 2 adapted to a tour agency, "80 dollars for person" ->
  "Better: $80 per person. It includes lunch and snorkeling." + Spanish reason; Azure 97/100 on a synthetic en-US note.
  Family chat smoke test after deploy: unchanged bilingual answer.
- WhatsApp `EspaLuzWhatsApp/pro_english_wa.py` + 13 routing lines in espaluz_bridge.py; Telegram `EspaLuzFamilybot/pro_english_tg.py` + 22 lines in main.py. Both live on Oracle.
- Web `/pro-english` (`696df27`): Spanish door when signed out; coach + mic (WAV for Azure) + "see it said" clip when signed in. Needs Lovable Publish.
- Clips: `generate-video` mode `pro_english`, PRO_ENGLISH_MONTHLY_CAP=2 for paid families. Buying MORE clips / a 1-hour avatar session = NOT built (needs a price + payment flow, Elena's call).
- NEXT: Elena's real phone test (WA "pro english", one voice note); clip button on the bots; Spanish promo + Michael as referrer.
