# Three bots, one verified memory, two languages — plan (16 Oct 2026)

Elena, 16 Oct: *"make all these three bots fully bilingual English Spanish recognising text, voice and screenshots and replying
with text and voice giving profound honest not generic simulated data"* · *"no bicycles — make work what bots already have — just
surgically enhancing and connecting them to each other making share data and learn from each other in bilingual way while
coaching me on the go and evolving"* · *"use [yesterday's] accomplishments"*.

**STATUS 16 Oct ~15:15 UTC — Elena said yes to all 4 packages + "LIVE question + ask for voice → voice". DEPLOYED:** CTO AIPA `fb698e86` (restarted 15:03:23), VibeJobHunter `9c804b8` + inbox fix + IMAP timeout (restarted 15:06:18), OpenClaw workspace + `settings/tts.json` "inbound" + Whisper words (15:09, no restart), hs-deal-prep LIVE RULE + DIGEST_MAX 11100 `04ce9835`. Built by workflow `wf_55e18cce-99a`: one builder per bot, 3 reviewers each (iron-clad no-overwrite · reality on Oracle · honesty), fixer, final proof with before/after inventories (nothing removed in any bot) + a CMO-only review (SAFE). Backups first: Oracle + laptop `_session-backups/bilingual-20261016/`.

**How this was made:** read-only workflow `wf_051bf4be-d20`. Three readers mapped each bot's real text/voice/screenshot path on
Oracle, a synthesis proposed 11 items, and each item was attacked by two checkers (does it really exist and work on Oracle today?
does it pass the golden rule?). Nothing was changed. Laptop = Oracle md5 for every cited file.

## Built on yesterday's wiring (15 Oct) — the shared memory already exists
Every 30 min CTO AIPA's `hs-deal-prep.cjs` writes, from HubSpot, into OpenClaw's workspace:
- `proof/TOOLS.md` — her VERIFIED FACTS: career EN + **SU TRAYECTORIA (ES)**, products, stack verified from code, 23 examples
  **EN + ES**, and each 🔎 interview deep-dive (`/research_employer`).
- `deals/TOOLS.md` — the 60 live job deals with their stage.
Every 10 min OpenClaw's cards cron keeps `interview-cards/lessons.json` — **her own corrections** ("No soy developer full stack
manual", "Dirijo los equipos, but I'm not hiring anybody") — printed as ELENA'S CORRECTIONS. Every hour VJH's judge re-reads her
579 decided HubSpot job deals and her No-fit reasons (`judge_decisions.json`, `judge_feedback.json`).

**Today only OpenClaw reads them.** The plan makes CTO AIPA and VibeJobHunter read the **same** files, so all three bots answer
from one verified source, obey the same corrections, in the language she used — and improve on their own as HubSpot and her
corrections change. No new module, service or cron in any item.

## Where each bot stands (verified 16 Oct)
- **OpenClaw** — most bilingual: hears EN/ES/mixed voice (50 voice turns 15 Oct), answers in her language, full mock interview
  `en español`, nova voice works (tts-1). Voice only when she asks. Screenshots never tried (gpt-4.1 can read them).
- **CTO AIPA** — hears EN/ES/RU, spoken reply in the language she spoke (built 14 Oct, not yet seen on a real turn). Reads
  photos, not images sent as files. Free chat answers from an old hardcoded paragraph ("11 AI products… under $15K", "Railway").
- **VibeJobHunter** — hears EN/ES/RU but translates to English and answers in English from Jan–May files or a canned reply
  (its Claude account has no credit). Typed Spanish not understood, screenshots ignored, no voice. Not bilingual yet.

## The items (all survived both checkers unless marked)
| # | Bot | What changes | Reuses | Size · cost per use (list price, not measured) |
|---|---|---|---|---|
| OC-1 | OpenClaw | Voice reply **whenever she sends a voice note** (`auto: inbound` in `~/.openclaw/settings/tts.json`, no restart). Pasted LIVE interviewer questions stay text-only and instant. Risk: if the model also calls its `tts` tool, two voice notes (seen 21× on 15 Oct). | existing TTS (tts-1, nova) | 1 value · ~$0.02/reply |
| OC-2 | OpenClaw | One paragraph: what to do with a screenshot (posting → fit + gaps from her facts; interviewer question → answer from her verified examples; recruiter message → draft reply in its language). Outside the MENU block, on Oracle's copy (the repo copy lacks the job-flow block). ~~imageModel config~~ refuted: pictures already work and the auto image model has a cross-provider backup. | gpt-4.1 vision, workspace files | 1 paragraph · ~$0.003/screenshot (re-sent each turn until `/new`) |
| OC-3 | OpenClaw | ~~Replace the voice glossary~~ refuted (already has the product names). Instead: append "agente, agentes, RAG" + one line of known mishearings ("STO AIPA" = CTO AIPA, "Ajende" = agente, "REG" = RAG). | `tools.media.audio.prompt`, AGENTS.md | 1 line · $0 |
| CTO-1 | CTO AIPA | Free chat + photo answers from the **facts part** of `proof/TOOLS.md` + her corrections (fallback: old paragraph when the file is missing), "answer in the language of her message", "a fact not in the sheet → say you don't know; the sheet overrides earlier answers". Switch `askAI` (Claude → Groq) to the existing `completeWithProfileDetailed('quality')` chain (OpenAI answers while Claude has no credit). | proof sheet, llm-resilience chain | S · ~$0.0015/question |
| CTO-2 | CTO AIPA | Screenshots sent **as files** (PNG/JPG/WebP/GIF, real mime type passed) go through the photo handler; photo answers are **spoken** too. | photo handler, speakBack | S · ~$0.02/spoken reply |
| VJH-1 | VibeJobHunter | Q&A answers from the live deals sheet (OpenClaw instructions stripped, stage ids → her labels), her verified facts, her corrections and the judge's ledger; model call through the judge's existing `_call_llm` chain (OpenAI first); **chat lock** (only her chat). | `llm_judge._call_llm`, the three sheets, judge ledger | S–M · ~$0.002/question |
| VJH-2 | VibeJobHunter | Spanish in → Spanish out: Whisper's own language label, no translation before answering, "answer in the language of her question", plain-text retry so a stray `_` never eats the answer. Ships with VJH-1. | Whisper call, ES sections of the proof sheet | S · ~$0.003/voice note |
| VJH-3 | VibeJobHunter | Screenshots answered: the judge's proven vision reader (reads her No-fit screenshots today), run off the event loop (`asyncio.to_thread`) so the job hunter never freezes; text goes to the grounded path, not the keyword templates. | `judge_feedback_sync._vision_openai/_gemini` | S–M · ~$0.005/screenshot |
| VJH-4 | VibeJobHunter | Voice reply after the text reply (tts-1, nova — the OpenClaw setting), async so the job loop never waits; speech cleanup ported from CTO AIPA's `forSpeech`. Only after VJH-1 + VJH-2, or it would read a canned English line aloud. | openai SDK already in VJH's venv | S · ~$0.02/spoken reply |
| CTO-3 | CTO AIPA | Panama proper nouns from the dead `trello-voice.ts` list appended to the live Whisper prompt (Balboa, MEDUCA, Banco General, Panapass…), kept under Whisper's 224-token window (checked with a tokenizer before shipping). | dead term list | XS · $0 |
| CTO-4 | CTO AIPA | Voice reply to **typed** messages too, behind `CTO_SPEAK_TEXT=1` (off by default), placed after the command and file-edit branches so commands are never read aloud. | voice handler's reply capture + speakBack | S · ~$0.02/spoken reply |

## Order and proof
1. OpenClaw OC-1/2/3 — config + text only, no restart. Proof: her next voice note gets a voice reply (WhatsApp "Sent media reply";
   Telegram: the voice note in the chat), a test screenshot session answers from her facts.
2. CTO AIPA CTO-1/2 (+3) — one build, scp, `pm2 restart cto-aipa --update-env`. Proof: a Spanish question answered in Spanish with
   the log line `[telegram/question] quality: openai answered`.
3. VibeJobHunter VJH-1/2/3 (+4) — one commit, ff-merge on Oracle, restart between cycles. Proof: journal "Voice transcribed (es)" and
   a Spanish answer naming a real deal from the sheet; a screenshot reply.
Each build gets the two-lens review before deploy. Nothing is wiped; backups go to `~/_session-backups/bilingual-20261016/`.
