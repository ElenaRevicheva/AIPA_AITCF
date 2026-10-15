# AIdeazz as a team — wiring plan (15 Oct 2026)

Elena, 15 Oct: *"do not reinvent bicycle. just follow golden rule. make work to the maximum what exists. i want Atlas be truly connected
to other agents, i want all my agents talk to each other, share precious skills, features and knowledgebase. AIdeazz is a team."*

**How this was made:** a read-only workflow (25 agents, `wf_e111b9d3-84a`): 7 readers mapped every agent and shared channel on Oracle,
a synthesis proposed 8 micro-wirings, each wiring was attacked by two independent checkers (does it really exist and run on Oracle? does it
pass the golden rule?), then a completeness critic. Nothing was changed. Every cited file was md5-identical laptop = Oracle on 15 Oct.
**Status: plan only. Each item waits for Elena's yes** (contract Teach → Plan → Confirm → Build → Document).

## What already works as a team (verified)
- **HubSpot is the shared memory, with one front door.** VJH, Atlas, Algom and the three EspaLuz bots all write through CTO AIPA's
  `POST /api/crm-event` (245 calls 1–15 Oct), each with its own deal prefix.
- **File drops carry knowledge between agents on a timer.** CTO `hs-deal-prep.cjs` (every 30 min) writes live job deals + Elena's verified
  facts into OpenClaw's workspace; OpenClaw reads them on every reply. VJH's `judge_feedback.json` (her 578 decisions) feeds CTO's `/queue`.
  VJH's follow-up radar proposes → Elena taps in the CTO bot → VJH obeys via `cto-aipa/data/radar-*.json` (a real two-agent loop).
- **Atlas → Monday lead machine:** Atlas's angle/concepts pick the lane for the Monday run; from 19 Oct Atlas letters also carry Atuona's
  approved AIGO films (`docs/selling/aigo-kit.cjs`, behind `ATLAS_AIGO_KIT`).
- **CTO feature commits fan out** through VJH :8080 to LinkedIn (CMO), the EspaLuz Influencer and X.
- **Telegram is one inbox for Elena** (four bots, notifications only).

## What does not work as a team
- **Atlas learns only stage counts** (`hs-outcomes-to-atlas.cjs` → whitespace `data/outcomes.json`); nothing reads Elena's notes.
- **Three small bugs break existing links** (items 2, 3, 5, 6 below).
- **Algom dead since 21 Aug** (X credits depleted) — a money decision, not code.
- **EspaLuz revenue never reaches HubSpot** (zero org traffic today, so not ranked).
- AILA/Hive is **not needed**: `/api/crm-event` + the existing wiring events already are the shared interface those designs describe.

## The plan — money first, each a few lines inside existing code
| # | Wiring (who → who) | Exact change | Size | Paying human | Proof of output |
|---|---|---|---|---|---|
| 1 | **Elena's field finding → Atlas Monday no-website note** | `scripts/lib/no-website-leads.cjs` `buildNoWebsiteNote` landline line → "Find their Instagram (search the name) and open the bio: the real WhatsApp is often behind a Linktree / bit.ly / wa.link link. Trust only a link on the clinic's own page, never one from another account. If none: call, or park." **Deadline: before Mon 19 Oct 16:00 UTC.** | 1 line | the no-website business owner Atlas stages with a landline reaches her WhatsApp instead of a dead line | Oracle pure-function render contains "Linktree"; `test-no-website-leads.cjs` 32/32; Mon 19 Oct a `· no_website` note with "Linktree" (0 picked is possible — report honestly) |
| 2 | **Email tracker gets through HubSpot again** (client email replies → deal stage → Atlas counts) | crontab: `hs-watch-manual-emails` off the shared `*/10` minute (→ `5-59/10`); it collides with `hs-fill-apply-kit` + `reply-radar` on the same key | 1 cron value | a client who replies to Elena's email is flagged 💬 They replied the same hour, not stuck behind rate limits | log shows a completed run with no `429` (today: 579 rate-limit lines; last runs ended on 429) |
| 3 | **Resend delivery check works again** (blocked emails → HIGH task) | `scripts/resend-reconcile.cjs:21` `val('RESEND_ADMIN_KEY') \|\| val('RESEND_API_KEY')` — after a read-scope check of the admin key | 1 line | a prospect whose email was silently blocked gets a "find another address" task instead of a wait for a reply that cannot come; Atlas stops counting it as sent | next hourly run: `"errors": []` (today: 451 × 401) |
| 4 | **Atlas → GA4 → Atlas** (fastest learning signal; replies are 0 in 62 reached) | `utm_campaign=atlas_${lead.lane}` on the 4 portfolio links in `atlas-lead-machine.cjs` (:1041, :1099, :1128, :1152); `utm_content=${angle.concept_id}` on the 2 email ones. The nightly `sync-atlas-ga4.mjs` already filters `atlas_*` | 4 lines | tells Atlas which lane/angle makes a prospect actually open the portfolio, so Monday picks shift toward what buyers click | first "GA4: N atlas_ row(s)" in `atlas-ga4-sync.log` (may honestly stay 0 at 8 leads/week). /portfolio carries GA4 `G-TL5S8V23LT` (checked) |
| 5 | **VJH judge stops learning a CTO staging note as Elena's reason** | `judge_feedback_sync.py:94` add `🚨\s*The form pre-fills` to `_KIT_NOTE`; widen the re-read at :704 | 2 lines | every job the judge screens is weighed against her real reasons, not a fake "pay below floor 8x" lesson | `grep -c pre-fills` judge_decisions.json + judge_feedback.json = 0 (today 7 and 6); pay lesson reads 1x |
| 6 | **VJH stops dropping interview invitations** (narrowed) | `orchestrator.py:1030/1075` include `INTERVIEW_REQUEST` only when a booking link is present; `html.escape` the link in the alert | 2–3 lines | the next employer who replies with a scheduling link reaches HubSpot + Elena's Telegram (today: 0 interview_request rows ever saved). Nobody is waiting today — it protects the next one | a synthetic test mail through the detector produces the push; journal line `[ResponseDetector->HubSpot]` with interviewRequest |

Optional, needs Elena's own words: one dated line in `ROLE_PROFILE` (`src/cover-letter.ts:442-450`) so what she taught OpenClaw
("I direct Claude Code and Cursor; I am not a hand-coding full-stack developer") also binds the letter writers.

## Rejected (and why) — so nobody rebuilds them
- **Atlas reads screenshots through the vision chain (C8):** ~120–150 lines, a new fetch/cache/classify/write flow inside a 187-line
  aggregator, and nothing reads the new counts → a bicycle. Use what runs: when a screenshot shows a human reply, move the deal to
  💬 They replied — `hs-outcomes-to-atlas.cjs` already counts it; Claude reads pasted screenshots on request (done for TLDC, 15 Oct).
- **Atlas skips known inquirers/clients (C3):** inquiry deals are named after people, so the match can never fire; `contactExists(email)` already protects.
- **Wiki incidents in OpenClaw's always-on sheet (C5):** titles without stories invite gpt-4.1 to invent them.
- **OpenClaw lessons into the apply kit automatically (C6):** unverified auto-captured text would reach employer-facing notes.
- **Cap the in-request cover letter (C7):** no client lost to the timeouts; if anything, skip letters for parked leads (saves money, not a money move).

Security items noticed in passing were reported to Elena separately (not in this public repo).
