# Part 2 — Morning Intelligence Brief

A daily narrative, not a dashboard: three things an executive needs before they
open anything else. Built only after Part 1’s pattern is proven —
deterministic facts first, model prose second, silence treated as an incident.

## What it is

One short message (Slack DM or email) with exactly three items, each one
sentence of fact plus one sentence of action:

1. **What changed overnight** — a revenue, conversion, or inventory move that
   is real against a baseline, not a chart annotation.
2. **What needs a decision today** — a stock risk inside lead time, a paid
   campaign past its kill threshold, a refund spike, a review-score drop on a
   hero SKU.
3. **What is trending wrong** — a slow bleed that will not page anyone but will
   matter in fourteen days if ignored.

Everything else is noise and is omitted. “Nothing material” is an allowed
output — and that output must still be delivered (see failure modes).

## Data sources

- **Shopify Admin API** — orders, refunds, top SKUs, checkout conversion for
  the trailing 24 hours vs the same weekday baseline.
- **Klaviyo** — campaign and flow revenue, unsubscribe rate, deliverability.
  Chosen over Amazon Seller Central for v1 because the API is cleaner and
  Manukora’s DTC margin lives here. Amazon joins in v2 via Selling Partner API
  once the brief’s trust is earned.
- **Cin7 (or the warehouse system of record)** as a read-only check on inbound
  ASNs that Shopify will not see.

Part 1’s lesson applies unchanged: a small Python job computes the three
candidates; the model only writes the sentences. No arithmetic in the prompt.

## Delivery without being creepy

A fixed 06:00 NZ send fails Los Angeles and fails travel. Inferring location
from device IP or calendar is the creepy path the brief warns against.

Instead: **compose once, deliver on first engagement, with a hard fallback.**

- Compose at 05:30 in the executive’s *declared* home timezone (a setting they
  own, not something we detect).
- Hold the message. Deliver on the first signal we already have permission to
  see: Slack presence flipping to active, or the first email open of the day on
  any prior Manukora mail. No new tracking pixels, no GPS.
- If no engagement by a configured latest time (e.g. 09:30 home-local), send
  anyway. The brief is never silently skipped.
- Travel mode is a one-tap pause or “send at 08:00 on the clock I set,” not
  geofencing.

Useful across NZ / LA / hotels without becoming a surveillance product.

## Tools and shape

- Scheduler: GitHub Actions or a tiny always-on worker.
- Compute: Python, same metrics/rules split as Part 1.
- Narration: one LLM call, temperature low, numeric guard reused.
- Transport: Slack Web API primary; Resend or SES as email fallback.
- State: one table of `brief_date`, `composed_at`, `delivered_at`,
  `delivery_channel`, `engagement_signal`, `item_ids` — enough to audit, not a
  warehouse.

## Operating cost at Manukora scale

Rough monthly, one executive plus one spare: Shopify + Klaviyo calls sit on
existing plans; LLM narration (~30 days × 1–2k tokens) is about $3–15; Slack /
email are already paid; compute is $0–10 of Actions minutes or a VM slice.
**Total well under $50/mo.** The expensive failure is not inference — it is a
noisy brief that trains the executive to ignore it.

## Failure modes and noise control

- **Silent death.** “Ran fine, nothing to report” looks identical to “the cron
  died.” Always emit a heartbeat: either the three-item brief or an explicit
  *All quiet — pipeline healthy* stub. Alert on *absence* of either by the
  fallback send time.
- **API partial failure.** If Klaviyo is down, ship Shopify-only with a visible
  `degraded: klaviyo` tag. Never invent the missing section.
- **Model invention.** Numeric guard gates the send. Fail → template sentences
  from the decision object, or hold and page.
- **Cry-wolf.** Cap at three items. Require a minimum effect size (e.g. ≥10%
  vs weekday baseline, or a dollar floor). Below that, deliver quiet.
- **Timezone drift.** Declared home zone only; travel is opt-in.

## What a developer builds tomorrow

1. Read-only Shopify + Klaviyo credentials.
2. `compose_brief(date)` → decision object with three scored candidates.
3. `deliver_brief` with engagement-triggered send + fallback clock.
4. Absence alert if neither brief nor quiet-stub lands by fallback time.
5. One-week shadow mode: compose daily, do not send, compare to what the
   executive says they actually needed.

Ship the quiet stub and the absence alert on day one. The brief that fails
loudly is safer than the brief that looks healthy while dead.
