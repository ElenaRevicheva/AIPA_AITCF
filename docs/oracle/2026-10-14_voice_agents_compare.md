# Voice agents compared — EspaLuz · CTO AIPA · OpenClaw (14 Oct 2026)

Read-only investigation (3 investigators + merge), numbers re-counted from production. The 60-second story for the
PITZ CEO call is also on the HubSpot Pitz deal ("🎤 VOICE-AGENT STORY"). Moves below are proposals — none applied
without Elena's go.

## 1. Who wins

**Best overall: EspaLuz.** It's the only one of the three that real people pay for and talk to.
- On WhatsApp, **242 of 435 messages since 11 Feb were voice notes (56%)**, from 26 users. I re-counted this today from the database.
- It's the only full voice loop running for customers: voice comes in, and every turn sends back a Spanish voice note and an avatar video. Since 25 Sep, Twilio fetched 12 voice replies and 12 videos, all of them successfully.
- The Telegram twin has sent 50 voice notes and 49 videos over its lifetime with **0 send failures**.

Honest limits:
- It's quiet now: 5 voice notes in the last 30 days, and the Telegram bot has been silent since 7 Sep.
- The "neural" voice is really gTTS (Google's free text-to-speech), because Microsoft Edge's voices return 403.
- Every WhatsApp reply since 27 Sep ran on the backup models, because the Anthropic credit is empty (12 of 12).

**Best for the PITZ story: CTO AIPA.** Chalán's loop is: a mechanic speaks → the system structures it → acts → confirms. CTO AIPA already does exactly that:
- **31 voice notes in 60 days** (16 Aug–12 Oct, re-counted today), 26 of them in Russian.
- **24 became Trello cards.** Board, column, label and due date are pulled out as structured data by a chain of 5 model providers.
- When you change a card by voice, it edits exactly one card. If 2 or more match, it asks you which one. It reads the card back from Trello before saying "done" (trello-voice.ts:1896-1900).
- 0 transcription errors in the 10 days of logs that are kept.
- Its one gap: it never speaks back.

So in the story, EspaLuz proves "real people speak Spanish to my system and hear Spanish back", and CTO AIPA proves "speech becomes a checked action".

OpenClaw isn't part of the story. It's your coach for the call. It has had only 4 real voice notes in 30 days, and its Spanish mode and nova voice have only been tested (14 Oct), never used for real. **The most valuable step today isn't code:** before your screen, run one voice session in OpenClaw: "prep me for Pitz en español quick".

## 2. The 60-second story

**English**
"I build voice agents that turn speech into action, and I measure them. My clearest example is EspaLuz, a bilingual Spanish tutor on WhatsApp. Since February, 242 of its 435 messages, 56%, were voice notes. Each one goes through Twilio, ffmpeg to 16-kilohertz mono, Whisper, then a language model with a fallback chain, and the family gets a Spanish voice note and a short video back. When my main model provider failed, 12 out of 12 replies still went out through the fallback. The second is my own operations agent on Telegram. In 60 days I sent it 31 voice notes, mostly in Russian, and 24 became Trello cards on the board and column I named. When I change a date by voice, it reads the card back from Trello before it says done. When it heard 'Cita' as 'CETA', I added my vocabulary to Whisper's prompt. That's Chalán's loop: speak a symptom, get a structured record, act, confirm. In Spanish, and verified."

**Español**
"Construyo agentes de voz que convierten lo que alguien dice en una acción, y los mido. Mi ejemplo más claro es EspaLuz, una tutora bilingüe de español en WhatsApp. Desde febrero, 242 de sus 435 mensajes, el 56 %, fueron notas de voz. Cada una pasa por Twilio, ffmpeg a 16 kilohercios mono, Whisper y un modelo de lenguaje con cadena de respaldo, y la familia recibe una nota de voz en español y un video corto. Cuando falló mi proveedor principal, las 12 de 12 respuestas salieron igual por el respaldo. El segundo es mi agente de operaciones en Telegram. En 60 días le mandé 31 notas de voz, casi todas en ruso, y 24 se convirtieron en tarjetas de Trello, en el tablero y la columna que yo nombré. Cuando cambio una fecha por voz, relee la tarjeta en Trello antes de decir que está hecho. Cuando escuchó 'Cita' como 'CETA', le agregué mi vocabulario al prompt de Whisper. Ese es el ciclo de Chalán: el mecánico describe un síntoma, el sistema lo estructura, actúa y confirma. En español, y verificado."

**Words to own:**
- **Graceful degradation / no single point of failure:** the backup models answered when the main one failed.
- **Read-after-write verification:** "acknowledgement is not completion". It checks Trello before saying done.
- **Vocabulary biasing:** you prime Whisper with the words it keeps getting wrong. For Chalán, that's mechanic words.

## 3. Sharing moves (ranked by money impact)

**1. CTO AIPA → OpenClaw: a vocabulary hint for your Spanish practice**
- **Reuses:** the WHISPER_PROMPT idea (telegram-bot.ts:8715-8726), copied into one config value: `tools.media.audio.prompt` in ~/.openclaw/openclaw.json. OpenClaw already reads that setting (runner-STmMAoZV.js:1198) and sends it to Whisper (:303-304). The glossary would be: Pitz, Chalán, taller, cotización, repuestos, AIdeazz, EspaLuz, HubSpot. `language` stays unset so your English still works.
- **Size:** one config value, plus a restart of OpenClaw.
- **Serves:** the PITZ CEO call on Friday.
- **Risk:** low. It's preventive: no mishearings have been measured yet. Restart after today's screen, not before.
- **Your go:** yes, because it restarts your coach.
- **Small add-on in the same visit (OpenClaw's own file, no restart):** add `|Respuesta pulida` to A_RE in build-cards.py:21. In a 14 Oct test, the model wrote that Spanish heading, so a Spanish Pitz answer written that way would never become a card.

**2. EspaLuz Telegram → EspaLuz WhatsApp: three fixes in one restart**
- **(a) One line:** give each reply its own audio file name. This copies the Telegram twin's per-clip id pattern (main.py:4516-4524) to espaluz_bridge.py:1624, which today uses a shared name, `/tmp/tts_segment_{i}.mp3`. On 30 Sep, 3 messages arriving within 1 second caused 20 "Audio file not found" errors. The same flaw could put one family's sentence into another family's audio.
- **(b) One argument list:** copy Telegram's 720p video recipe (main.py:3164-3185) over `-c:v copy` at :1807. All 12 replies first built a 21.2 MB video and then had to shrink it.
- **(c) One token, a plain bug fix:** in espaluz_enhancements.py:453, change `ctx['slang'][:5]` to `list(ctx['slang'])[:5]`. All 12 turns logged an error here, so the 21-country context never reached the tutor.
- **Serves:** EspaLuz subscribers (2 active on WhatsApp).
- **Risk:** low.
- **Your go:** YES, because it touches paying users. Deploy by copying the named files only; no git pull (NOW.md:198).

**3. CTO AIPA + OpenClaw → EspaLuz: a second speech-to-text provider**
- **Reuses:** the Groq-first, OpenAI-second order both of them already run (telegram-bot.ts:8732-8769; OpenClaw's audio models list). `GROQ_API_KEY` is already in both EspaLuz .env files.
- **Size:** one extra call in the failure path of transcribe_audio_with_openai (espaluz_bridge.py:2228-2275) and of transcribe_audio (main.py:4323-4339).
- **Serves:** subscribers. Voice is 56% of WhatsApp input, and when OpenAI credit ran out (11–12 Oct) a voice note could only get "No pude transcribir". No customer was caught in that window. It also makes "no single point of failure" true when you say it to the CEO.
- **Risk:** low.
- **Your go:** YES.

**4. OpenClaw → EspaLuz: the nova voice**
- **Reuses:** OpenClaw's proven OpenAI voice (gpt-4o-mini-tts, nova), added as one step inside espaluz_neural_tts.generate_voice_sync (:185) before gTTS. gTTS stays as the floor.
- **What it changes:** conversation/translate mode upgrades at once in both bots. The main tutor voice note still calls gTTS directly (main.py:3225, bridge ~1630); switching that is a second, separate yes. It also fixes English being read in the Spanish voice.
- **Size:** about 10 lines in one existing function.
- **Serves:** subscribers.
- **Risk:** medium. It adds a cost to every reply on the OpenAI account that ran dry on 11–12 Oct, and replies get slower.
- **Your go:** YES, because it touches paying users and money.

**5. CTO AIPA's unused code → its live voice path**
- **Reuses:** the HEARD_AS / repairNames table (trello-voice.ts:962-980). It fixes real mishearings like "STO AIPA" → "CTO AIPA", but nothing calls it: 0 references in the live build and 0 log lines.
- **Size:** export it and wrap the two `return transcription` lines in transcribeAudio (:8728). Plus one log line with length, script and provider, never the content, so voice volume becomes provable from logs.
- **Serves:** the PITZ story. Right now "a repair table for misheard words" would be an untrue claim.
- **Risk:** low; only you use this bot.
- **Your go:** yes, because it restarts CTO AIPA.

**6. CTO AIPA speaks its confirmation (only if you'll demo it on Friday)**
- **Reuses:** its own synthesizeBriefingMp3 (sprint-briefing/tts-openai.ts:4, nova voice), plus OpenClaw's rule of using voice only when it's worth hearing.
- **Size:** one call after the confirmation in routeToTrello (:316), behind an on/off setting.
- **Serves:** the PITZ demo. A mechanic with greasy hands needs to hear "done", not read it.
- **Risk:** low.
- **Your go:** yes. Skip it if there's no demo.

## 4. What NOT to do

- **No shared "voice service" across the three, and no orchestrator layer.** Each agent's voice intake already works.
- **No fourth or "unified" model fallback chain.** All three already have one: llm-resilience.ts:350, llm_chain.py:40, and OpenClaw's model chain.
- **Don't wire EspaLuz into OpenClaw for Spanish practice.** OpenClaw already does Spanish questions, Spanish answers, Spanish verified examples and the nova voice.
- **Don't build a Chalán mock for the interview.** Tell the shape with real numbers.
- **Don't chase the Edge 403 and don't buy ElevenLabs.** The 403 is on Microsoft's side, and gTTS already covers it with 0 errors users could see.
- **Don't switch everyday voice notes to Speechmatics.** It's built for batch jobs (/campaign, /podcast), not live notes.
- **No restarts of OpenClaw before today's screen.** Never git pull EspaLuz on Oracle.
- **Don't say these on the call:**
  - that EspaLuz has a "neural voice" (it's gTTS in practice)
  - that Claude runs EspaLuz (all 12 recent replies came from the backup models)
  - that the name-repair table is live
  - any real-use numbers for OpenClaw's Spanish mode (it's only been tested)
- **Don't read Q1 of your Product Manager card word for word.** It calls you "CEO".

**Separate from this plan:** two log-hygiene issues in the EspaLuz bots were reported to Elena privately (not in this public repo).

**How I checked:** I only read files and logs and ran count queries on the server; I changed nothing on purpose. One thing you should know: the CTO AIPA re-count went through its own database code. When it connects, that code runs a "create these tables if they're missing" check. The tables already existed, so nothing changed.