# Algom Alpha — the $8 X Premium plan vs the X API (28 Oct 2026)

**Short version:** the $8/month X Premium subscription and the X API are two separate
products with two separate bills. Premium makes @reviceva's *account* stronger. It does
not give Algom a single API call. Algom has posted nothing since at least 17 Oct because
the **API** balance is at zero (`402 credits depleted`, re-checked 25 Oct 20:10 UTC in the
fleet audit). No change to the Premium plan changes that.

Sources: X's own pricing page (`docs.x.com/x-api/getting-started/pricing`) and billing
page (`docs.x.com/x-api/fundamentals/post-cap`), read 28 Oct 2026; X Help "About X
Premium". Third-party blogs disagree on details, so only the official figures are used
below.

---

## 1. What the $8 buys (X Premium, middle tier) — and what it does for Algom

| Premium feature | Does Algom benefit? |
|---|---|
| Blue checkmark on @reviceva | **Yes** — every auto-reply, like and follow Algom makes carries it. Credibility for automated outreach. |
| Larger reply prioritisation | **Yes** — Algom's engagement replies (`engagement-bot.js`) rank higher under other people's posts. This is the one Premium feature that directly helps the lead path. |
| Long posts (up to 25,000 chars; a Basic-tier feature) | **Possible** — X applies the account's limit to API posts too, so Algom's 280-char thread splitting could become one long post (one `$0.015` create instead of N, and no half-posted-thread failure). Verify with one test post before changing the split. Threads vs long post is a reach question — Elena's call. |
| Half the ads, Media Studio, Grok, ID verification | No effect on Algom. |
| Creator revenue share eligibility | Needs 5M impressions in 3 months — not relevant yet. |
| **API access / API credits** | **Not included in any tier.** |

So the $8 is not wasted — but it only pays off once the API can post again.

## 2. What the API costs now (pay-per-use, official figures)

| Item | Price |
|---|---|
| Post created (text only) | $0.015 |
| Post created **containing a URL** | **$0.200** (13× the text price) |
| Post read (search, stream, timelines) | $0.005 per post, deduplicated per day |
| User lookup | $0.010 per user |
| "Owned reads" (your own posts, mentions, followers, lists) | $0.001 per resource |
| Starter credit | $20 after saving a card and a first credit purchase; first auto-recharge matched up to $50; starter credits expire after 3 months |
| Caps | 3M post reads/month; a per-cycle **spending limit** can be set in the Developer Console |

There is no free tier and no monthly minimum. Credits are prepaid; at $0 every call fails
with 402 until a top-up.

## 3. Where Algom's money would actually go (measured from the code, 28 Oct)

| Path | Process | Volume | Monthly (est.) |
|---|---|---|---|
| Posts, text only | `dragontrade-main` (`POST_INTERVAL_MIN/MAX` 300–420 min → ~4/day; threads split at 280 chars → ~4–8 creates/day) | 120–240 creates | **$2–4** |
| Posts carrying the CoinGecko referral link (`index.js` market posts) | same | ~0.5–1/day | **$3–6** — a referral link that earns Elena nothing costs 13× a plain post |
| Engagement: own-id lookup | `engagement-bot.js`, every 45 min | 32/day | up to $9.60 → **$0 after today's fix** (id cached per process) |
| Engagement: mentions + ≤2 replies/run | same | ≤20 owned reads/day, ≤64 replies/day worst case | **< $3** |
| Repost check: home timeline | `index.js`, every 30 min × 20 posts | up to 960 reads/day | **up to $70–140** — `DISABLE_REPOSTING=1` makes it $0 |
| Keyword search | `algom-poll` — 5 queries × 10 posts every 30 min | up to 2,400 reads/day (dedup helps) | **$75–360** |
| Filtered stream | `algom-stream` — 5 broad rules ("AI engineer" hiring…, "build AI" founder…) 24/7 | unbounded | **$50–300+** (it has restarted 55,193 times since 16 Aug; it never stays connected on 402) |

**Keep-all** (everything on): roughly **$200–800/month**. The May 2026 balance died in days for
exactly this reason, and the posting side was never the problem.

**Read-light** (post + reply + follow back; no search, no stream, no timeline reposts):
roughly **$5–10/month**, and the $20 starter credit alone covers 2–4 months.

Since Algom's search/stream path has produced **0 prospects past triage** (92 `CLIENT-ALGOM`
deals, newest 21 Aug — agent inventory 27 Oct), read-light loses nothing measurable.

## 4. Elena's move (the only part no agent can do)

1. Open the X Developer Console billing page — the 🔴 Telegram alert from Algom links
   straight to it. Save a card, buy the smallest credit pack, and claim the $20 starter credit.
2. Turn **Auto Recharge ON** (the first recharge is matched up to $50) and set a
   **spending limit of $10 per cycle**. The limit is the fuse: with it, a wrong config can
   cost at most $10, never the whole balance.
3. Reply **read-light** or **keep-all**. Read-light is the recommendation.

## 5. The agent's move once she answers (Oracle `~/dragontrade-agent/.env`, then `pm2 restart`)

Read-light, all existing switches, no code:

```
DISABLE_REPOSTING=1        # home-timeline read loop off (switch already in index.js)
ALGOM_POLL_MINUTES=360     # keyword search 4×/day instead of 48×/day (new dial, default 30)
```

plus `pm2 stop algom-stream` (it only restarts into a 402 anyway) — **only on Elena's
word; nothing is switched off unasked.** Then prove it from logs: the next
`✅ Tweet … posted:` line, and the Developer Console usage graph flat except for creates.

Optional, Elena's call: drop the `🔗 https://www.coingecko.com?…` line from the
attribution block (keep "Data provided by CoinGecko" as text) so market posts cost $0.015
instead of $0.200.

## 6. What shipped today (28 Oct, dragontrade-agent `main` `5d92d29`)

- `engagement-bot.js`: own user id looked up once per process instead of every 45 min.
- `algom-poll.js`: cadence from `ALGOM_POLL_MINUTES` (default 30, unchanged; log line
  corrected — it claimed "every 3min").
- Not deployed to Oracle: this session's permission mode blocked every Oracle read, and
  Oracle's `dragontrade-agent` checkout is known to sit on a local commit (`3ad5d5a`) that
  diverges from GitHub — **merge, do not overwrite** when deploying.

## 7. The concept

**A subscription is not an API plan.** The two are separately metered: one buys reach for
a human account, the other buys calls for a program. Paying one and expecting the other
is the same shape as the June–August outage — the system *looked* funded and was not.
Named failure mode: **silent failure behind a paid front** / **separately metered
dependencies**. Interview line: *"Our X agent posted zero for nine weeks while the account
was paid up; the dependency that failed was metered on a different bill. Now a 402 pages
me within one cycle, auto-recharge has a spending cap, and the read loops are a config
dial."*
