# Zapier — Sr. Technical Account Manager
**Submitted 1 Sep 2026, 06:12 EST** · https://jobs.ashbyhq.com/zapier/eaf4ef36-116b-4aa1-b874-7474b16851e6
$55K–$82.6K + bonus · Remote Central & South America · **PST working hours required**
HubSpot: `[HIRING-VJH-SERP-LEAD] Sr. Technical Account Manager @ Zapier` — stage `⏳ Sent`

**Sourced by VJH** (`serpapi_jobs` path) at 09:04 UTC, applied within three hours.

---

## Why this role fits unusually well

Their JD asks the TAM to help customers with *"accuracy, reliability, **evaluation**,
**fallback behavior**, human oversight"*, to *"explain the difference between deterministic
automation, AI-assisted workflows, and agentic systems"*, and to *"improve error handling,
monitoring, alerts, fallback behavior, and recovery"*. That is a description of the fleet —
five-provider fallback chains, a 137-test eval harness, fail-closed gates — plus seven
years of executive conversations. Reports into Marketing/GTM, **not** Engineering, so the
Deputy-CEO half counts rather than being a curiosity.

⚠️ **PST hours = roughly 12:00–20:00 Panama.** Answered head-on rather than hedged.

---

## The five answers as submitted

### How did you hear about this role
Own job-discovery pipeline (VibeJobHunter): a Google Jobs query surfaced it, the relevance
gate and LLM judge scored it, and it landed in HubSpot at 09:04 UTC linking straight to the
Ashby posting. The ad itself is on Zapier's own careers board.

### One AI workflow — trigger / what it does / what you iterated on
**The lead concierge.** Full write-up with diagram and production log:
https://claude.ai/code/artifact/a79b439f-09eb-42df-9300-cd5e9614df66

- **Trigger:** form webhook, chat message, or a 5-minute mailbox poll — all converge on one
  CRM deal, so a lead arriving twice by two channels does not become two records.
- **Does:** creates the deal → cached health verdict decides which model *owns* the reply →
  5-minute grace window for the premium path, else the local 5-provider chain drafts in ~3s
  → approval card to Telegram, one tap → email sends → delivery and open webhooks write back
  onto the deal. 20-minute backstop drafts regardless if nothing has.
- **Iterated on, in order:** (1) *the better model never ran* — two writers, no ownership
  rule, the faster cheaper one won every race → health verdict + grace window
  [redundancy is not precedence]; (2) *one lead, two replies* — caused by fix #1 → sender +
  message fingerprint [idempotency]; (3) *"Sent" did not mean sent* — the log printed SENT
  on provider **acceptance** → delivery/open webhooks write back what the provider observed
  [acknowledgement is not completion]; (4) *a quiet week and a broken week look identical* →
  synthetic lead through the real path daily at 07:45 [liveness is not correctness].

### AI changing quality, not speed
The daily publisher was inventing plausible, untraceable numbers. Fixed in three steps:
a grounding gate that **fails closed**; then the discovery that silence was also a failure;
then the actual root cause — **the prompt was acting as a source**, because the daily brief
contained example figures the model faithfully copied. Digits are now stripped from briefs,
real measured evidence is fed instead, an unsourced paragraph is salvaged rather than the
draft discarded, and a deterministic measured-notes article is the floor. Result: publishes
daily *and* every number is traceable.

### Expanding impact with AI, and how the approach evolved
Twelve production systems, one operator. The limit was never hours — it was re-solving the
same failure without recognising it. So instead of more automation (which adds surface you
cannot watch), built the layer that makes failures **reusable**: every incident gets a root
cause, a **named** failure mode, and a standing check, published openly.
Arc: (1) AI to write code faster — capped at my hours; (2) unattended agents — decoupled
from hours, but working and dead looked identical; (3) verification habits — never trust a
source-side signal; (4) naming and publishing — the check becomes reusable.
Live example from that week: a new source logged a healthy count hourly and delivered
**zero** for a full day; 279 items marked "already handled" without being handled.
Corpus: https://aideazz.xyz/ai-ops-wiki.html

### Logistics
Panama City, UTC-5, no DST. She/her. LinkedIn: linkedin.com/in/elenarevicheva

---

## ⚠️ Open risk on this deal

**Contacts (0), no deal owner.** The response detector matches replies to people. With no
contact linked, a recruiter reply landing in Gmail may not attach to this deal — the same
shape as the 23–24 Aug miss where a real interview request went undetected. If Zapier
writes, add the recruiter as a contact on this deal immediately.
