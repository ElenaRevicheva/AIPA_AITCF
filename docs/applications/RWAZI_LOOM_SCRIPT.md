# Rwazi — AI Engineer, Marketing & GTM Systems · Loom script

**Deal:** `64491479628` · score **100** · applied 31 Aug 10:45 UTC with the old
stub letter (the deal predates the 31 Aug 17:52 tailored-letter fix).
**Posting:** <https://jobs.ashbyhq.com/rwazi/21ca2582-5797-4488-b46f-5103f9d77226>
Still **listed** as of 2 Sep. Contractor, 25–40h, Global remote, US-timezone overlap.

**Why this Loom matters more than another email:** the posting says it outright —
*"Have built and can demo autonomous or semi-autonomous workflows that ran in
production — **links or Looms beat resumes**."* They asked for exactly one thing.
She has it and has not shown it.

**Format:** screen recording, **4–5 minutes**, real systems only. No slides. Talk
over live screens. If something is imperfect on screen, leave it — they are
hiring someone who ships, not someone who demos.

---

## The through-line

Their job description is not a wish list — it is a description of what she
already runs, for herself, in production. The Loom should say that once, plainly,
and then prove it five times. Do not oversell; the artefacts are stronger than
any adjective.

**Opening line (say it exactly):**

> "You listed five things you want built. I've built all five — for my own
> company, running in production. Let me show you each one in about four
> minutes, in the order you listed them."

---

## Beat 1 — Outbound engine (~60s)

Their bullet: *sourcing → enrichment → scoring → personalized sequencing, wired
into the CRM. Agentic where possible, human-in-the-loop where it matters.*

**Show:** HubSpot deal list filtered to `[CLIENT-ATLAS]` / `[CLIENT-CTO-INGEST]`,
then one deal's note with a per-prospect letter, then the confirm page at
`/go/outreach-email/<slug>`.

**Say:**
- Sourcing runs on Bright Data SERP against a defined ICP shape, not a keyword list.
- Enrichment adds the owner contact; misses cost nothing because only hits bill.
- Scoring is a numeric audit per prospect — the registry holds **371** of them.
- Sequencing writes a letter **per prospect from that prospect's own audit**, not a
  template with the name swapped.
- **The human-in-the-loop is deliberate:** the link opens a confirmation page, never
  a send. Nothing leaves without a human clicking. "I built the one-click send to
  be one-click *review*."

## Beat 2 — Inbound & lifecycle (~45s)

Their bullet: *lead routing, qualification, nurture triggers.*

**Show:** the `lead_triage` numbers, and a Telegram concierge draft card.

**Say:**
- Inbound leads are classified into a typed urgency 1–4 — **555 triaged**.
- Routing is a primary/backup pair: Make handles it, and if Make does not answer
  within a grace window the server-side path covers it. **The card names which one
  drafted it**, so a silent failover is visible rather than invisible.

## Beat 3 — Content pipeline with QA gates (~60s) ← *their exact phrase*

Their bullet: *AI-assisted production … **with QA gates so nothing off-brand ships**.*

**Show:** a published field note, then the grounding-gate log line.

**Say:**
- Daily publishing across blog and Dev.to, assembled from verified incident fields.
- **The gate is the interesting part:** every number in a draft must trace to a
  measured source. Unsourced figures fail the gate and the post does not ship.
- "It has blocked my own posts. That is the point — I would rather publish nothing
  than publish a number I cannot show you where it came from."
- Also a **near-duplicate guard**: token-overlap scoring against everything already
  published, because the first version compared slugs and reworded titles sailed
  through.

*This beat is the strongest one. It is the difference between "AI writes our copy"
and "AI writes our copy and cannot embarrass us." Spend the extra ten seconds.*

## Beat 4 — GTM data layer (~45s)

Their bullet: *dashboards and reporting … without anyone assembling them by hand.*

**Show:** `/queue` — the two-lane view with a record open, history first.

**Say:**
- Every agent writes to one event log: **1,875 events across 1,268 distinct deals**.
- The CRM is the system of record; this is the system of engagement. **Zero writes
  back** — it reads only, so an operational view can never corrupt the record.
- A record opens **history first, then the draft**, because acting before reading is
  how a second cold email reaches someone who already replied.

## Beat 5 — Temporary fixes (~50s) ← *close on this one*

Their bullet: *when a GTM workflow breaks or a tool gap appears, you build the
patch fast rather than waiting on a vendor.*

**Show:** the before/after listener numbers.

**Say (this happened on 2 Sep, the day before recording):**
- A community listener had reported "0 candidates" every hour for weeks. It read
  like *no demand*. It was actually **Reddit returning 403 and 429** — they block
  unauthenticated search from datacenter IPs.
- The vendor answer was "register an API app". Their console would not issue one.
- "So I did not wait. I routed it through Bright Data, which I already pay for and
  which already reads Reddit. **0 → 45 threads fetched, 5 on-topic candidates**, in
  an afternoon."
- Then the honest second half: the first pass returned junk — debate subreddits
  that discuss AI constantly and buy nothing. **A denylist built from what the run
  actually produced**, not from imagination, fixed the relevance.

**Closing line:**

> "Everything I showed you is running right now, built solo, on one VPS. Your day-7
> ask is a shippable artifact rather than a plan — that's the only way I work. Happy
> to walk any of it in more depth."

---

## Rules for the recording

- **Real screens only.** No slides, no diagrams, no architecture drawings.
- **Every number said out loud must be one shown on screen.** 371, 555, 1,875,
  1,268, 0→45. If it is not on screen, do not say it.
- **Do not say "AI-powered" or "world-class".** Show the artefact and stop talking.
- **Do not hide the imperfections.** A grade-D score from a training-data buyer, a
  listener that returned junk before the denylist — these are *credibility*, and
  this posting is explicitly hiring for someone who finds and patches breakage.
- **Under five minutes.** They read Looms to disqualify quickly; give them no reason.

## After recording

1. Upload; get the share link.
2. Reply on the existing application thread (Ashby confirmation email) — **do not
   start a new application**. Subject: `AI Engineer, GTM Systems — 4-min demo of the
   five systems you listed`.
3. Body: two sentences plus the link. *"You said links and Looms beat resumes. Here
   are the five GTM systems from your posting, running in my own production. Four
   minutes."*
4. Log it as a HubSpot note on deal `64491479628` so it is not only in an inbox.
