# EspaLuz — where users, trials and payments live (measured 29 Oct 2026)

Why there are several stores: each was added when a channel was built (Telegram bot, WhatsApp bot, web SaaS),
then a "unified" database was added to merge them, and the older stores were never switched off.

| Store | What writes it | Holds (29 Oct) | Verdict |
|---|---|---|---|
| `espaluz_unified` (Postgres on the Oracle box) | WhatsApp bot trials; both bots' memory/chat; PagueloFácil snapshots (`espaluz_pf_durable.py`); JSON-file snapshots | 26 users, 32 trials (Jul 2025–Sep 2026, 3 active), 12 old migrated subscriptions (no PayPal id), 1 PF snapshot | **The one home (recommended)** |
| `espaluz_telegram` (same Postgres) | Telegram bot `start_trial()` | 5 users, **0 trials** although the bot started trials → the write fails and the JSON file is used instead | Legacy — point the Telegram bot at unified |
| `espaluz_whatsapp` (same Postgres) | older WhatsApp code | 13 users, 19 trials (to Jan 2026), 5 subscribers | Legacy — superseded by unified |
| Bot JSON files (`*_trials.json`, `*subscribers.json`) | both bots, PayPal webhooks | 2–7 entries each; 8 "active" PayPal ids never checked with PayPal | Working cache only, not truth |
| `espaluz_funnel` (Oracle Autonomous DB, CTO AIPA) | `/wiring/event` from both bots | 6 rows, all trial | Duplicate counter — retire as truth |
| Supabase "EspaLuz AI Family Tutor" | web SaaS (Lovable): sign-up, PayPal (`src/config/paypal.ts`) | 8 accounts (newest Jul 2025), `user_subscriptions` 0 | Stays (the web app is built on it); sends its sign-ups/payments into unified |
| HubSpot `[ESPALUZ]` deals | CTO AIPA from the same events | — | A view for selling, not the truth |

Payments: PayPal webhooks run inside each bot (`paypal_webhook.py`, `paypal_webhook_server.py`); PagueloFácil via
`espaluz_paguelofacil*.py` → `pf_payment_snapshots` in unified. Paid conversions recorded anywhere so far: **0**
(the one PF snapshot and the 8 JSON PayPal ids must be checked against PayPal/PagueloFácil before counting).

## Plan (additive, nothing deleted, each step needs Elena's go)
1. Nightly backup of `espaluz_unified` (none exists).
2. Telegram bot writes trials to unified, as the WhatsApp bot already does (config/one code path, not a rebuild).
3. Web SaaS sends sign-ups and payments into unified as the same trial/paid events.
4. One-time check of the 8 PayPal ids + the PF snapshot against PayPal / PagueloFácil.
5. Her CRM EspaLuz lane and HubSpot read their counts from unified. Older stores frozen, not deleted.

## Built 29 Oct (steps 1 + the verified layer)
- Nightly dumps of the 3 EspaLuz databases (`~/backups/espaluz-pg/dump.sh`, 07:23 UTC, 14 days).
- `truth_people` / `truth_runs` in `espaluz_unified`, rebuilt hourly by `scripts/espaluz-truth-sync.py` — reads every
  store above, writes nothing else. First result: 37 real people, 37 trials, 0 active trials, 2 active in 30 days,
  0 paid customers; all PayPal charges come from owner/admin payer accounts.
- Still to plumb: web SaaS (needs Supabase service-role key on Oracle); CRM lane + HubSpot read from `truth_people`.
