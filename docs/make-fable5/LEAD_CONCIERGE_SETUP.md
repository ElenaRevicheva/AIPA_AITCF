# Lead Concierge — Claude Fable 5 in Make.com (Setup Recipe)

> **Goal:** every new portfolio inquiry (HubSpot) gets an instant, personalized draft reply
> written by Claude Fable 5 with full portfolio context, delivered to Elena's Telegram for
> one-tap approval. Make drafts; Oracle (`/concierge/draft`) owns one-tap send + CRM notes.
>
> **Pipeline:** InquiryForm → CTO AIPA inquiry-proxy → HubSpot (`[AIDEAZZ-FORM]` message stamp)
> → Make (Contacts/Created **or** Custom Webhook) → Fable 5 → `/concierge/draft`.

## Architecture (3 modules)

```
[1] HubSpot: Watch CRM objects (contacts)   ← new portfolio inquiry appears
    OR Custom Webhook (for reused emails)   ← cto-aipa POSTs MAKE_CONCIERGE_WEBHOOK_URL
[2] Anthropic Claude: Create a message      ← model: claude-fable-5
[3] HTTP → cto-aipa /concierge/draft        ← TG one-tap send (v2+)
```

## July 23 2026 — two bugs that blocked re-tests (fixed in cto-aipa)

1. **Reused email ≠ new contact.** Form push upserts the existing HubSpot contact and
   only creates a new deal. Make's Contacts/**Created** never fires. Fix:
   - Allowlisted test emails (`adamvelena@`, `marinakulaginabowen@`, `kiravelerevich@`,
     override via `CONCIERGE_TEST_EMAILS`) **delete+recreate** the contact so Created fires.
   - Production re-inquiries POST `MAKE_CONCIERGE_WEBHOOK_URL` with the same payload.
2. **Form contacts look identical to buyer-radar junk** (same app `39045903`,
   `source=OFFLINE`, `INTEGRATION`, `num_conversion_events=0`). A filter like
   "only native HubSpot forms" drops **all** of them. Fix: every form contact's
   `message` is prefixed with `[AIDEAZZ-FORM]` (custom property `aideazz_lead_kind`
   is optional — private app lacks schemas scope). **Make filter must use the stamp.**

## Elena's 15 minutes (credential steps only)

1. **make.com** → log in (free plan is enough: this uses ~3 ops per inquiry).
2. Open scenario **5633833** (or create fresh) → 3 modules in order.
3. **Module 1 — HubSpot** "Watch CRM objects": connect HubSpot, object `Contacts`,
   watch `Created`. **Filter (required):**
   `message` **contains** `AIDEAZZ-FORM`
   — do **not** filter on `hs_analytics_source*` / `num_conversion_events` / "own forms";
   those cannot tell portfolio form from radar noise.
4. **Reused-email path (required for production re-inquiries):** add a **Custom webhook**
   module (or a second scenario that shares modules 2–3). Copy the webhook URL into Oracle
   `.env` as `MAKE_CONCIERGE_WEBHOOK_URL=…` then `pm2 restart cto-aipa --update-env`.
   Map webhook JSON → Claude the same way: `email`, `firstname`/`name`, `message`.
5. **Module 2 — Anthropic Claude** "Create a Message": paste Anthropic API key
   (console.anthropic.com → API keys), model **claude-fable-5**, max_tokens 1500.
   - System prompt: paste the **SYSTEM PROMPT** block below verbatim.
   - User message: map HubSpot (or webhook) fields:
     `New inquiry — Name: {{firstname}} {{lastname}} | Email: {{email}} | Message: {{message}} | Company: {{company}}`
6. **Module 3 — HTTP** to `/concierge/draft` (see v2 below). Turn scenario **ON**.
7. Test with an allowlisted address (e.g. `marinakulaginabowen@gmail.com`) — contact is
   recreated, stamp applied, Make should run end-to-end within one poll.

## v2 — one-tap send (July 12 2026)

Module 3 is now **HTTP → CTO AIPA** instead of a plain Telegram message. CTO AIPA
sends Elena the Telegram message itself, with **[✅ Send now] / [✏️ Edit] / [🗑 Skip]**
buttons; tapping Send emails the Fable 5 reply to the lead via Resend
(aipa@aideazz.xyz, reply-to Elena's gmail). **Edit-before-send:** REPLY to the
draft message in Telegram with the full edited text (20+ chars) and that version
is emailed instead, same subject. Drafts persist in `data/concierge/` on Oracle.
Recipient is resolved server-side from recent portfolio-inquiry contacts
(stamped / linked to `[CLIENT-CTO-INQUIRY]` deals in the last 90 min, with
first-name match in the draft opening) — the HTTP module only needs the
single `claude_output` field; ambiguous recipients get a no-button TG notice.

**Module 3 (HTTP "Make a request") config:**
- URL: `https://webhook.aideazz.xyz/cto/concierge/draft`
- Method: POST · Body type: Raw · Content type: JSON (application/json)
- Headers: `Authorization: Bearer <CONCIERGE_SECRET from Oracle .env>`
- Request content (map the chips):
```json
{
  "email": "<module-1 email chip>",
  "name": "<module-1 firstname+lastname chips>",
  "inquiry": "<module-1 message chip>",
  "raw": <module-1 RAW HUBSPOT RECORD chip, in quotes>,
  "claude_output": <module-3 Text Response chip, in quotes>
}
```
- If the direct property chips are blank (known Make quirk), the server extracts
  email/name/message from `raw` automatically — mapping `raw` + `claude_output`
  alone is enough.
- SPAM verdicts from Fable 5 become a plain Telegram notice, no button.

Also July 12: `/marketing/inquiry-proxy` now pushes every form inquiry to HubSpot
**immediately** (commit `43dac73`) — the daily 08:00 UTC triage cron is enrichment,
no longer the only path. Form → HubSpot contact in seconds → Make fires on next poll.

## Cost guardrail

- Fable 5 is Anthropic's most expensive model. This scenario calls it **only when a real
  inquiry arrives** — at current inquiry volume that is approximately $0/month, and each
  call is a few cents. If volume ever spikes, swap model to `claude-sonnet-5` in one click.
- Make free plan: 1,000 ops/month; this uses ~3 ops per inquiry.

## SYSTEM PROMPT (paste verbatim into Module 2)

```
You are the lead concierge for Elena Revicheva — executive-turned-AI-builder
(7 years Deputy CEO/CLO in digital infrastructure), based in Panama, bilingual EN/ES.
She ships production AI systems solo: a 10-agent ecosystem (9 in production) running at
$0/month on Oracle Cloud — LangGraph stateful pipelines, pgvector RAG, multi-model LLM
routing, voice pipelines, CRM/revenue automation.

A new inquiry just arrived through her portfolio (https://aideazz.xyz/portfolio).
Write a DRAFT reply for Elena to review — never send anything yourself.

Rules:
1. Reply in the language of the inquiry (English or Spanish).
2. Be warm, direct, professional — an experienced executive's voice, not marketing fluff.
3. Ignore a leading `[AIDEAZZ-FORM]` stamp on the inquiry text if present (internal CRM marker).
4. Cite the 2-3 MOST RELEVANT proof links for this specific inquirer, chosen from:
   - CTO AIPA (autonomous eng. control tower): https://github.com/ElenaRevicheva/AIPA_AITCF
   - VibeJobHunter (job-hunt automation): https://github.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF
   - Atlas Shifted (marketing strategist agent, live): https://webhook.aideazz.xyz/whitespace/atlas.html
   - EspaLuz (bilingual family AI, WhatsApp/Telegram, live): https://wa.me/50766623757
   - AI Film Studio (autonomous AI cinema): https://atuona.xyz/aifilmstudio/
   - Ops Runbook (how she operates the fleet): https://aideazz.xyz/sop-ai-ops.html
   - Blog (AI in production, bilingual): https://aideazz.xyz/blog
   - Podcast: https://podcast.aideazz.xyz
   - Pitch (investors): https://aideazz.xyz/pitch.html
   - Calendly: https://calendly.com/elena_revicheva/coffee-chat
5. If the inquiry is a job/role conversation: position her for AI-augmented builder,
   GEO/AEO/TechSEO, or AI-automation solutions architect lanes (NOT ML-research roles).
6. If it is a client/service inquiry: propose a concrete small first engagement and
   offer the Calendly link.
7. If the inquiry looks like spam or is abusive, output only: SPAM — no reply needed.
8. End with a suggested subject line for the email.

Output format:
DRAFT REPLY:
<the reply>

SUBJECT: <suggested subject>

WHY THESE LINKS: <one line>
```

## Verification checklist (before the case study goes out)

- [ ] Test inquiry submitted through the live portfolio form
- [ ] HubSpot contact created (existing pipeline, unchanged)
- [ ] Make scenario fired exactly once
- [ ] Fable 5 draft arrived in Telegram, correct language, sensible links
- [ ] Screenshot each step for the case study
