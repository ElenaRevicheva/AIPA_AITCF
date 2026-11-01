# EspaLuz — one payment truth for Telegram, WhatsApp and the web (plan, 1 Nov 2026)

**Status: PLAN — awaiting Elena's go-ahead.** Elena, 1 Nov: "reminded before the trial ends, offered PágueloFácil or
PayPal, if he pays it is exactly detected and recorded everywhere in one brain … PágueloFácil is paid once every month,
PayPal is a monthly subscription … one source of truth, no duplicates (idempotency) … no bicycles: it is all wired, plumb
it correctly and clean up the stale, dead information that serves nobody. Check all the facts."

## The facts (measured on Oracle + Supabase, 1 Nov 2026; emails shown only as hashes)

| Store | Who uses it | Rows | Newest write | Verdict |
|---|---|---|---|---|
| `espaluz_unified.subscribers` (email + `telegram_id` + `whatsapp_id` + status + `subscription_data`) | WhatsApp gate (`user_trial_system.py`) | 2, both `active` (`a96407`, `d33cea`, both channels linked) | 26 Jul | **LIVE — this is already the one-brain table** |
| `espaluz_unified.user_trials` | WhatsApp gate | 32 (3 say `active` but newest end 6 Oct) | 29 Sep | **LIVE**, statuses stale |
| `paguelofacil_payments.json` (+ `pf_payment_snapshots` backup) | PF webhook, both bots | 2 payers, both `paid_until` 29 Jul; 2 processed | 14 Aug | live mechanism, **no current payer** |
| Telegram JSON: `telegram_subscribers.json`, `telegram_trials.json`, phone↔email map, reminders | Telegram gate | 3 subs (`a96407`, `d33cea` + `567159` only here) | 19 Jul | **duplicate of `subscribers`** |
| `espaluz_unified.subscriptions` | nobody | 12, all `expired` | 20 Jan | **DEAD** (migration leftover) |
| `espaluz_whatsapp.subscribers` / `.user_trials` | nobody (WA reads unified) | 5 / 19 | Jan | **DEAD** (pre-unified copies) |
| WA JSON `subscribers.json`, `user_trials.json`, maps | fallbacks only | — | Feb–Jul | **duplicate / fallback** |
| `telegram_subscriptions` (Telegram DB) | analytics writer only | 2 | Jan | **write-only copy** |
| Telegram `subscribers.json`, `discovered_subscription*.json`, `user_trials.json` | legacy fallbacks | — | Jan–Jun | **DEAD** |
| Supabase `user_subscriptions` (web) | web UI only; written once by the browser | Elena: 3 rows, paid-to 17 Sep 2025 | Aug 2025 | **stale** (renewals never arrive) |

Also measured: PayPal webhook events are never signature-checked although `PAYPAL_WEBHOOK_ID` is configured; renewals
(`PAYMENT.SALE.COMPLETED`) never set a "paid until" date; WhatsApp drops them; reminders fire only when the user writes;
`/pagar` refuses early renewal; trials are 14 days (Telegram) / 7 (WhatsApp) / never-ending (web).

## The design — no new system: plumb what exists, retire the rest
1. **The source of truth = the existing `espaluz_unified.subscribers` + `user_trials`** (already keyed by email with
   both channel ids, already the WhatsApp gate's store). Telegram's gate switches from its JSON files to the SAME rows —
   it reuses WhatsApp's `user_trial_system` the way WhatsApp already reuses Telegram's PágueloFácil module.
2. **The one door = the existing `espaluz-payments-webhook`** (PayPal + PágueloFácil, `webhook.aideazz.xyz`). Fixed, not
   replaced: PayPal events verified with the existing `PAYPAL_WEBHOOK_ID`; PF grants only after the transaction is
   re-read from PágueloFácil; every payment writes to `subscribers` (PF grants move off the JSON file).
3. **Idempotency — the only additions:** a `paid_until` column on `subscribers`, and one unique-keyed list of processed
   payment ids `(provider, event_id)` in the same database. A payment delivered 1 or 10 times counts once. PF's own
   `processed[codOper]` check already does this — it moves from the lock-free file to that list.
4. **PayPal monthly:** each renewal sets `paid_until` = PayPal's next billing date (+3 days grace); a cancel never takes
   back a month already paid. **PágueloFácil:** each payment = `max(now, paid_until) + 30 days`; early renewal allowed.
5. **Reminders:** the existing messages (2 days / 24 h before the trial or the PF month ends, with `/pagar` + the PayPal
   link) run on the existing 10-minute loop instead of waiting for the user to write.
6. **The web:** its `user_subscriptions` row is written by the webhook (through a bot-secret function) for families
   linked with `connect CODE`, never by the browser; then `/classroom` gets the existing `FeatureGate`.
7. **Clean-up (snapshot first, nothing deleted):** stop writing and archive the DEAD/duplicate stores above after their
   contents are compared with `subscribers`; `567159` (only in Telegram's JSON) is checked against PayPal before it moves.

## Phases (each verified before the next; Elena + her mom must read `allowed` before every switch)
1. Facts → `subscribers`: add `paid_until` + processed-ids list; backfill from PayPal API for the 3 subscription holders;
   the webhook verifies and writes there; replay the same event twice → one row, one month.
2. Telegram gate reads `subscribers`/`user_trials`; Telegram JSON stops being written.
3. Reminders on the loop; early PF renewal; one trial length.
4. Web mirror + RLS self-grant closed + classroom paywall (Lovable Publish).
5. Archive the dead stores (snapshots kept).
Sandbox first (PayPal sandbox, `PAGUELOFACIL_SANDBOX`) for every money path.

## Progress
- **Phase 1 ✅ LIVE 1 Nov 13:23 UTC** — `espaluz_payment_truth.py` (Familybot `c864e12`), hooked into the 3 existing
  doors (payments webhook PayPal + PágueloFácil, WhatsApp `/paypal-webhook` `4ea4489`). `subscribers.paid_until` +
  `payment_events (provider, event_id)` PK. Replay test: same id → `True False`. Forged event → "NOT verified - ignored".
  6-hourly reconcile also reads PayPal's last-31-day transactions (type `RP`). Backfill: **17 PayPal subscriptions, all on
  the 2 family emails** (Elena's family subs — deliberate, internal; 0 outside PayPal payers); `a96407` paid to 3 Dec,
  `d33cea` to 28 Nov.
- **Found:** two PayPal REST apps (Telegram app webhook → `/paypal-webhook` :5000, NOT subscribed to
  `PAYMENT.SALE.COMPLETED`; WhatsApp app webhook → `/espaluz/paypal-webhook` :8081, sale events only). The reconcile makes
  the missing subscription harmless; adding the event in the PayPal dashboard is optional.
- **PágueloFácil verification:** not added — the module has no transaction-query call; idempotency by `codOper` now in
  the DB. Open: confirm PF's query API before trusting a PF webhook alone.
- **Phase 2 ✅ LIVE 1 Nov ~14:10 UTC** — both gates ask `espaluz_payment_truth.access()` first (Telegram by its link file +
  telegram id; WhatsApp by phone digits). Paid → allowed ("Paid until …"); paid time ended → the old JSON "active" no
  longer counts, PágueloFácil/trial still can; no row or DB down → old checks (never lock out). WhatsApp: 14-day trial,
  PF beats a cancelled PayPal, `$11` plan link everywhere, both plans accepted. Verified on Oracle before deploy: both
  family phones + Elena's Telegram → "Paid until 03 Dec / 28 Nov"; unknown number → no row. Familybot `029e11a`,
  WhatsApp `542974b`.
- **Web pricing ✅ committed** (ascent `d0e0a0c`, needs Lovable Publish): 14 days free, "EspaLuz Family $11/month"
  (`P-6GR9…`, verified the web's PayPal app = same merchant), "First PayPal charge 2 weeks after you subscribe",
  PágueloFácil line, real features (kids classroom, parent report, daily game, one family), Premium card removed.
- **Phase 3 ✅ LIVE 1 Nov ~15:05 UTC** — Telegram trials in `user_trials` (`tg:<id>`); existing reminders sent on time by both
  bots' 10-minute loops (WhatsApp only inside its 24 h window); early PágueloFácil renewal allowed. Familybot `9f1bf20`,
  WhatsApp `f5dacb1`.
- **Next:** Phase 4 (web
  `user_subscriptions` written from the truth + RLS self-grant closed + classroom `FeatureGate`), Phase 5 (archive).
- **Decided 1 Nov:** new PayPal subscribers on every channel → `P-6GR9…` $11/month (2 PayPal weeks); PágueloFácil $11/30 days.

## Decided / measured
- **App free trial = 14 days on every channel** (Elena, 1 Nov 2026).
- **PayPal plans, read live from PayPal 1 Nov:** `P-6GR9…` "EspaLuz Monthly" (Telegram) = PayPal trial **2 weeks**, then
  **$11.00/month**; `P-38A7…` "EspaLuz Standard" (WhatsApp + web) = PayPal trial **1 week**, then **$7.77/month**.
  PágueloFácil = **$11 / 30 days**. So price and free time differ by channel, and PayPal's own trial stacks on top of the
  app's 14 days. During a PayPal trial, `paid_until` = PayPal's first billing date (from the API), so the extra week is
  honoured exactly and ends exactly.

## Open for Elena
- One PayPal plan for new subscribers on every channel ($11 Monthly with 2 free weeks, or $7.77 Standard with 1)?
  Existing subscribers keep the plan they are on.
