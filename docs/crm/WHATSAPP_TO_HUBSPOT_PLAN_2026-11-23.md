# WhatsApp → HubSpot: plan (23 Nov 2026) — WAITING ON ELENA'S OK

Elena's ask: WhatsApp chats must show up as activity on the right HubSpot contact and deal — both EspaLuz tutor
users (Twilio WhatsApp) and her own hand-sent business WhatsApp (WhatsApp Web on the laptop).

Nothing below is built or deployed yet. Teach → Plan → **Confirm** → Build → Document.

## What already exists (REUSED, measured 23 Nov)

| Piece | Where | What it does today |
|---|---|---|
| New-person → deal | EspaLuzWhatsApp `espaluz_catch.note_new_contact()` (live since 23 Nov) | First message from anyone → `[ESPALUZ] WA <number> — trial` deal + contact, once per person |
| Film arrival → deal | `espaluz_catch.push_arrival()` | Film-coded first message → same deal, with film code |
| Trial start → deal | `user_trial_system._push_espaluz_to_crm()` | Old trial path, same deal name |
| The door | cto-aipa `/api/crm-event` → `pushEspaLuzDealToHubSpot()` (`src/hubspot-client.ts:1438`) | Dedupes by deal name, creates contact + deal, adds notes |
| Twilio message reader | EspaLuzWhatsApp `scripts/checks/wa_conversation_log.py` | Reads every WA message both ways from Twilio; masks numbers; never sends |
| HubSpot helpers | `src/hubspot-client.ts` | `findDealByName`, `upsertContact`, `addNoteToDeal`, `associateDealContact` |

Live HubSpot today: **23** `[ESPALUZ] WA` deals, each with 1 contact; the 10 newest are all `closedlost` (old trials).

## What is missing (NEW)

1. **No conversation activity anywhere.** A deal is created on the first message and then goes silent — HubSpot
   cannot tell a family that talks daily from one that wrote "hola" once in September.
2. **No writer for HubSpot's native WhatsApp activity.** Grep of `src/` + `scripts/`: zero uses of the
   `communications` object (`hs_communication_channel_type = WHATS_APP`). HubSpot shows that object on the
   timeline as a WhatsApp message, with its own icon — better than a note.
3. **The contact has no phone field set** (name is `EspaLuz` / `WA <number>`), so HubSpot's own phone search
   and click-to-WhatsApp don't work on it.
4. **Hand-sent business WhatsApp is logged by hand only** (her "wa sent" note + stage move, memory
   `feedback_wa_sent_create_fu`); nothing creates the follow-up task.

## Flow 1 — EspaLuz WhatsApp users (automatic)

**One daily activity line per active family, not a copy of the chat.**

- New cto-aipa helper `logWhatsAppActivity({dealId, contactId, direction, body, timestamp})` → POST
  `/crm/v3/objects/communications`, channel `WHATS_APP`, associated to contact + deal. One helper, reused by
  both flows.
- New Oracle cron (once a day, ~23:00 Panama), reusing the Twilio reader's code path: last 24 h of messages,
  grouped by number → for each number with a `[ESPALUZ] WA` deal, ONE communication:
  `EspaLuz WhatsApp · 14 messages from the family, 15 replies · first 09:12, last 21:40 · kids class: yes`.
- **No message text in HubSpot by default.** These are families with children; HubSpot is a sales tool, not
  the lesson log. Counts and times are enough to see who is alive. (Elena can say "include the first line".)
- Same run fills the contact's `phone` when blank (fill-blanks only, never overwrite).
- A family that comes back to life while its deal is `closedlost` → note "🔁 active again" on the deal; the
  stage is NOT moved by the bot (her call).
- Synthetic test ids (`+9990000…`) are skipped — the same guard `/api/crm-event` already has.
- No LLM call at all (nothing to route through the waterfall). Free.

Proof when built: one real family's daily line read back from HubSpot by id, plus the cron's result line
(`wa-activity: N families logged`), not its "ran" line.

## Flow 2 — Elena's hand-sent business WhatsApp

Honest facts first:
- **Personal WhatsApp / WhatsApp Web has no official API.** Reading it means scraping the web page or a
  third-party "unofficial API" — both break WhatsApp's terms and can get her number banned. **Not doing that.**
- **HubSpot's own WhatsApp inbox** needs a WhatsApp Business API number connected to HubSpot and (as far as I
  know) a Professional-tier HubSpot plan; she is on Starter (~$10/mo). Not worth paying for to log a few chats
  a week. (To confirm on her account before ruling out for good.)
- **Zero-build option that already works:** on any deal in HubSpot (web or phone app) → *Log activity* →
  communication → channel *WhatsApp*. Free, today. Downside: she has to find the deal first.

What I'd build (small, reuses the Flow 1 helper):

- **CTO AIPA Telegram command** (works from her phone, on the go):
  `/wa <words from deal name> | <what happened>`
  e.g. `/wa clinica dental | sent diagnostic offer`
  → finds open deals by name → if one match, logs a WhatsApp communication on that deal + its contacts and
  replies with the deal link; if several, replies with numbered buttons to pick. Words like `sent` also move the
  deal to ⏳ Sent and create the 2-working-day follow-up task (what `feedback_wa_sent_create_fu` says a
  session does by hand today); `replied` moves it to 💬 They replied.
- **Same thing as a script** for Claude/Cursor sessions:
  `node scripts/hs-log-wa.cjs --deal=<id or words> --text="..." [--sent|--replied]`.
- **Confidential clients:** the logged line is whatever she types; the command never adds anything.
  For NDA work (e.g. the consulting engagement) the rule stays: a generic status line only.

## Cost / risk

- HubSpot API calls only; no new paid service; no LLM.
- Needs the Service Key to allow writing communications — tested first with one labelled test record,
  read back, archived.
- Deploy = named files to Oracle + `pm2 restart cto-aipa --update-env` (Flow 2) and one crontab line (Flow 1),
  only on her go.

## Decisions for Elena

1. Flow 1: counts only (recommended) or also the family's first line of the day?
2. Flow 2: build the Telegram `/wa` command + script (recommended), or only use HubSpot's built-in *Log WhatsApp*?
3. Go to build both, then deploy only after showing her one real logged line?
