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
2. **Kids mode on WhatsApp** — a `/kids`-style trigger ("Alisa" / "kids") that reuses the SAME rules as Telegram:
   copy the kids block of `EspaLuzFamilybot/main.py` (steps, stories, `kids_heard`, filters, memory card, emergency/
   stop, sit-still, and the 31 Oct 18:36 "talk less" rule = espaluz-chat `KIDS_QUIET`) into one shared module, so both bots import it instead of drifting twins. Fix "preschooler" → 6–7.
3. **Hero voices** — Pere and Titi as WhatsApp voice notes (same MiniMax voices via Replicate, gTTS fallback).
4. **Photos** — her photo → Grok vision → the heroes talk about it (same prompt as the web).
5. **Parent report** — the existing report loop sends to the parent's WhatsApp when the family's link is WhatsApp.
6. **Stars/stickers** — a short "⭐ 23 · 🦥🐒🦜🐸" line at the end of a lesson (text, no page needed).

Phase 3 of ONE_FAMILY_MEMORY_PLAN (one kids brain behind all three surfaces) is the end state; step 2's shared module
is the first piece of it.

## Constraints
- WhatsApp outreach = laptop only (`feedback_whatsapp_laptop_only`) — this plan is the EspaLuz **bot**, not outreach.
- Deploy by guarded check-then-copy, `systemctl restart espaluz-whatsapp`, live md5 = commit, a result line in the log.
- Child data never in public pages or logs at full length.
