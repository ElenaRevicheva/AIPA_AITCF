# EspaLuz WhatsApp parity — plan (31 Oct 2026)

**Rule (Elena, 31 Oct 2026):** everything EspaLuz does in the SaaS web classroom and in the Telegram family bot must
also be possible in **EspaLuz WhatsApp** — in LATAM, WhatsApp is the winner. Memory: `feedback_espaluz_whatsapp_parity`.

## Audit — what WhatsApp has today (EspaLuzWhatsApp `main`, git = Oracle 133/133 since 31 Oct 11:39 UTC)

| Feature | Web classroom | Telegram | WhatsApp |
|---|---|---|---|
| Free-first model waterfall, RAG on local embeddings | ✅ | ✅ | ✅ (31 Oct step 1) |
| Kids mode with Pere 🦥 + Titi 🐒, lesson steps, weekly story | ✅ | ✅ | ❌ — only a generic "young child" prompt, still says **preschooler** (ages are 6–7) |
| React to her words first (rules 1–4), feelings first, question hold | ✅ | ✅ | ❌ |
| Memory between lessons + safety filters (hard moments, adult voice, echoes) | ✅ | ✅ | ❌ |
| Emergency / "ciao" stop, sit-still in the car, "no te escuché" trim | ✅ | partly (prompt) | ❌ |
| Hero voices (Pere 0.82, Titi 0.9) | ✅ | ✅ | ❌ — one gTTS voice |
| Hero clips / pictures | ✅ | ✅ | ❌ |
| Photos the heroes talk about | ✅ (after Publish) | ✅ | ? (image handling exists for adults — to check) |
| Linked to the family's SaaS account (`connect CODE`) | — | ✅ | ✅ (31 Oct, step 1) |
| Parent report after each lesson | — | ✅ | ❌ |
| Stars / stickers | ✅ (after Publish) | stars only | ❌ |

## Order (each step shippable, verified from logs before the next; surgical, no rebuild)

1. ✅ (31 Oct 19:34:35 UTC: Elena linked; `connected_bots` platform=whatsapp, id = `wa_`+hash, no phone stored) **Link WhatsApp to the family** — `connected_bots.platform='whatsapp'`, WhatsApp accepts `connect CODE`; the
   kids-memory/report functions take a WhatsApp identity. Without this, nothing below can share memory.
2. ✅ (31 Oct 20:03 UTC first real WhatsApp lesson: hello + her answer saved as classroom/source whatsapp) **Kids mode on WhatsApp** — DONE DIFFERENTLY than planned: no Python copy. `EspaLuzWhatsApp/kids_lessons.py` sends each turn to the SaaS `espaluz-chat` (v237) with `ESPALUZ_BOT_SECRET` + the hashed WhatsApp id → ONE kids brain for web + WhatsApp (every live-test rule applies at once; rows land as classroom, source `whatsapp`, so memory + the report see them). "kids" starts, "adult" ends, 2 h quiet ends. Voice notes → Groq Whisper → turn; photos → the same vision path (= step 4 too). Menu shows KIDS MODE + FAMILY ACCOUNT. Old plan text: — a `/kids`-style trigger ("Alisa" / "kids") that reuses the SAME rules as Telegram:
   copy the kids block of `EspaLuzFamilybot/main.py` (steps, stories, `kids_heard`, filters, memory card, emergency/
   stop, sit-still, and the 31 Oct 18:36 "talk less" rule = espaluz-chat `KIDS_QUIET`) into one shared module, so both bots import it instead of drifting twins. Fix "preschooler" → 6–7.
3. ⏳ (deployed 31 Oct 20:09 UTC; verified on Oracle: 2/2 MiniMax lines → one 11 s note, nothing sent) **Hero voices** — each line via SaaS `generate-voice` (Pere 0.82, Titi 0.9), joined by ffmpeg into ONE voice note after the text; waits on a real lesson. Old text: — Pere and Titi as WhatsApp voice notes (same MiniMax voices via Replicate, gTTS fallback).
4. ⏳ (rides on step 2: a photo in kids mode goes to the same espaluz-chat photo path) **Photos** — her photo → Grok vision → the heroes talk about it (same prompt as the web).
5. ⏳ (deployed 31 Oct 20:09 UTC) **Parent report** — `kids_lessons.report_once` every 10 min; kids-memory v9 `platform:whatsapp`; ONE channel per lesson (WhatsApp lesson → WhatsApp; web lesson → Telegram, or WhatsApp if no Telegram) — proven: last 30 min Telegram 0 turns / WhatsApp 2. Phone kept only in the bot's gitignored `kids_report.json`, recorded on `connect` or a kids turn (Elena's first report comes after her next kids turn). Old text: — the existing report loop sends to the parent's WhatsApp when the family's link is WhatsApp.
6. **Stars/stickers** — a short "⭐ 23 · 🦥🐒🦜🐸" line at the end of a lesson (text, no page needed).

Phase 3 of ONE_FAMILY_MEMORY_PLAN (one kids brain behind all three surfaces) is the end state; step 2's shared module
is the first piece of it.

## Constraints
- WhatsApp outreach = laptop only (`feedback_whatsapp_laptop_only`) — this plan is the EspaLuz **bot**, not outreach.
- Deploy by guarded check-then-copy, `systemctl restart espaluz-whatsapp`, live md5 = commit, a result line in the log.
- Child data never in public pages or logs at full length.
