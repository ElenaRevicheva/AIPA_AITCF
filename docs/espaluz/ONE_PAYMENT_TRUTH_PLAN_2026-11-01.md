# EspaLuz — one payment truth for Telegram, WhatsApp and the web (plan, 1 Nov 2026)

**Status: PLAN — awaiting Elena's go-ahead.** Elena, 1 Nov: "if the free trial ends he is reminded beforehand, offered
PágueloFácil or PayPal, if he pays it is exactly detected and recorded everywhere in one brain … PágueloFácil is paid
once every month (no recurring approved), PayPal is a monthly subscription … the source of truth is always one, no
duplicates — this is idempotency."

## What is true today (read from code + live Oracle data, 1 Nov)
- **Payment state lives in ~14 places:** Telegram JSON files (`telegram_subscribers.json`, `telegram_trials.json`, the
  phone↔email map…), WhatsApp Postgres `user_trials`/`subscribers` + JSON fallbacks, one shared PágueloFácil JSON file
  (`paguelofacil_payments.json`, written by 3 processes with no lock), the web's Supabase `user_subscriptions`, and an
  `espaluz_unified.subscriptions` table (12 rows, all `expired`, untouched since 20 Jan).
- **PayPal renewals are never recorded:** no channel stores a "paid until" date; "active" stays active until a cancel.
  WhatsApp drops renewal (sale) events (plan-id filter); Telegram ignores EXPIRED/FAILED. The web was written once by
  the browser (`now+30 days`) and never again → Elena, a paying family, reads "expired" there since 17 Sep 2025.
- **No webhook is verified** (PayPal or PágueloFácil). A forged PágueloFácil POST grants 30 days.
- **No idempotency except PF `processed[codOper]`** in a lock-free JSON file (a race can double-grant or lose a grant).
- **Reminders exist** (2 days / 24 h before the trial ends, 3 days / 24 h before a PF month ends) but only fire when the
  user writes; there is no scheduler. `/pagar` refuses to sell an early renewal although the text invites it.
- **Trials:** Telegram 14 days, WhatsApp 7 days, web "7 days" forever (never expires).
- **Two PayPal plans** (Telegram `P-6GR9…`, WhatsApp/web `P-38A7…`) and two subscriber stores: a payer on one channel is
  unknown on the other.

## The design — one writer, one ledger, everyone reads
**The ledger lives in Oracle's `espaluz_unified` Postgres** (both bots and the payment webhook already run on that box
and already use that database; no new service). Two tables:

```
payment_events   one row per provider event — UNIQUE (provider, event_id)   ← idempotency lives here
                 provider: paypal | paguelofacil ; kind: activated | renewed | paid | cancelled | expired | failed
                 payer keys: tg:<id> / wa:<phone> / email / paypal sub id ; amount ; raw payload hash ; received_at
access           one row per payer key — paid_until, source (trial|paypal|paguelofacil), status, paypal_subscription_id
```

- **Every payment goes through ONE door:** the existing `espaluz-payments-webhook` (`webhook.aideazz.xyz` → :5000).
  It verifies the event (PayPal: `verify-webhook-signature` with the existing `PAYPAL_WEBHOOK_ID`; PágueloFácil: the
  transaction is re-read from PágueloFácil before it counts), then `INSERT … ON CONFLICT (provider, event_id) DO
  NOTHING`. Only a NEW row moves `paid_until`. The same event delivered 1 or 10 times = one paid month.
- **PayPal (monthly subscription):** each `PAYMENT.SALE.COMPLETED` sets `paid_until` = PayPal's `next_billing_time`
  (read from the PayPal API) + 3 days grace. Cancel/expire do NOT cut a month already paid; they stop the next one.
- **PágueloFácil (one payment = 30 days, bought again each month):** `paid_until = max(now, paid_until) + 30 days`, per
  new `codOper`. Early renewal allowed (stacks).
- **Trial:** recorded in the same `access` table (`source = trial`), one length for every channel.
- **The gates READ the ledger:** Telegram `is_user_allowed` and WhatsApp `is_user_allowed` ask `access` first (their
  existing trial/reminder code stays; the JSON files stop being written, kept as read-only backup).
- **The web reads a mirror the ledger writes:** for a family linked with `connect CODE`, the webhook upserts its
  `paid_until` into Supabase `user_subscriptions` through a bot-secret edge function. The browser stops inserting
  "active" itself (today any logged-in user can write `status='active'` via RLS). Then `/classroom` gets the existing
  `FeatureGate`.
- **One family pays once:** a payment on any linked identity (Telegram, WhatsApp, web) counts for the whole family
  (`connected_bots` already maps them to one account).

## Reminders and links (Elena's flow)
A scheduled pass (existing report loop pattern, every 10 min) on `access`: **2 days and 24 h before `paid_until`**
(trial or PF month), once each, in the channel the family uses: "Your free trial ends in … — pay $11 for 30 days with
PágueloFácil: <link> or subscribe monthly with PayPal: <link>". PF link = the existing `create_payment_link`; PayPal link
= the existing subscribe link. PayPal subscribers get no reminder (it renews by itself) unless a payment FAILS.

## Phases (each one shippable and verified before the next)
1. **Ledger + one door + idempotency** — the two tables; the webhook verifies and records; replay test: the same event
   POSTed twice → one row, one month. Backfill from today's stores (snapshot first, nothing deleted).
2. **Bots read the ledger** — both gates; Elena + her mom (deliberate family subs) verified `allowed` before restart.
3. **Reminders + links on a schedule**, early PF renewal unblocked.
4. **Web mirror + classroom paywall** — edge function, RLS self-grant closed, `FeatureGate`, Lovable Publish.

## Risks / rules
- Never lock out a payer: every phase starts by checking known paying accounts (Elena, her mom) read `allowed`.
- Nothing deleted: old JSON/tables are snapshotted and kept read-only.
- Money flows: test with PayPal sandbox / PF sandbox (`PAGUELOFACIL_SANDBOX` exists) before live.
- Open for Elena: one trial length for all channels (Telegram 14 vs WhatsApp 7 today)?
