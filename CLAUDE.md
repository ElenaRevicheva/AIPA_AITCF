# How sessions in this repo are run

Elena is learning on the go. Every session must leave her more hireable than it
found her, and the work must be oriented at getting her paid. These rules are
not optional politeness — they are the deliverable.

---

## `docs/oracle/NOW.md` — the shared session

Cursor Cloud, Cursor Desktop and Claude Code all work this repo. **They cannot see
each other's chats.** There is no shared conversation and no Claude MCP in Cursor.
The only things all three read are **HubSpot** and **`docs/oracle/NOW.md`**.

So NOW.md is not documentation. It is the working memory of whichever agent is not
currently running. Treat it as a handover note to a colleague who starts blind.

### The contract

**PART 1 of NOW.md is the agent protocol. Follow it — it is not advisory.** In short:

1. **Read it first.** Before any work, in every tool. What is in flight, whose move each
   item is, what is known broken. Not reading it is how two agents solve the same thing
   twice, or undo each other.
2. **Claim before you touch.** Add your row to the session board and push it *before*
   editing shared code or restarting a service; delete the row when you stop. There is no
   file locking — this table is the substitute. A claim older than 2h with no newer commit
   from that agent is dead; take it. If a row is live and you need those files, **work
   somewhere else** rather than being careful.
3. **Push to `main`, immediately.** See the hard rule below.
4. **Never destroy.** No `--force`. Never `reset`/`checkout --` a file you did not write
   this session. Never blind `git pull` on Oracle's `cto-aipa` (it deploys by named-file
   `scp`, so its checkout is meant to lag). Same file changed by both → **merge, do not
   overwrite**; the version carrying a verification wins. One deployer at a time — check a
   service's uptime before restarting it.
5. **Catch the other's fall.** Run the five-item start-of-session check in PART 1 §4 before
   new work. Every item is a failure that shipped — above all §4.3: prove the last change
   produced **output**, not merely that it ran.
6. **Read §6 DELIBERATE before "fixing" anything that looks broken.** Wellfound at zero,
   YC not scraped, Oracle lagging, the failing Claude eval — all intentional, all have
   already cost someone an investigation.
7. **A work product lives in a file or in HubSpot — never only in a chat.** A letter, brief,
   application answer or set of findings goes to a committed file in `docs/` or a HubSpot note
   on its deal, immediately. Chat is where work is discussed, not where it is kept — the other
   agent cannot read it, the session board cannot see it, and closing the tab destroys it.
8. **Pause with a handoff block:** DONE / NEXT / VERIFIED BY / RISK. An agent that stops
   without one has lost the work even if the code is committed.
9. **Keep it to one screen per part.** A queue, not a history. Delete finished lines; the
   git log and `docs/` keep the record.

The same protocol is mirrored in `.cursor/rules/now-md-shared-session.mdc` for Cursor.
**Change one, change both** — a rule only one side can read is the bug it exists to
prevent.

### 🚨 NOW.md lives on `main`. Always. No exceptions.

**Earned 30 Aug 2026.** Cursor created NOW.md on 25 Aug on branch
`cursor/intelliops-bd-money-play-abc0` and never merged it. From `main` — which is what
Claude Code reads and what Oracle runs — the file did not exist, so a second version was
written from scratch five days later. Both agents were correct about their own branch and
neither could see the other.

Nothing was lost, but the coordination file had silently failed at its only job for five
days. **A shared-state file on a branch the other tool never reads is a private note.**

If your work must live on a branch, the NOW.md update still goes to `main` on its own —
say there that a branch exists and what is on it. Never leave the handover note inside
the thing being handed over.

### What belongs in it

- The money queue: what is in flight and **whose move it is** (Elena's vs the agent's)
- Anything **open or known-broken** that a new session must not assume works
- Anything **stranded on a branch**, and the warning if merging it would delete work
- Standing traps that keep costing time
- What just landed, briefly — so nobody re-investigates a solved problem

**Not** in it: architecture, post-mortems, or anything already in `docs/`, memory or the
AI Ops Wiki. Link to those instead.

---

## CURRENT STATUS (25 Aug 2026) — the 21 Aug pin blocker is RESOLVED

**Pushing aideazz commits is safe again.** 4everland is publishing: the URL that
used to 404 returns 200, `geo-manifest.json` reads `2026-08-24`, and the 23rd and
24th both pushed clean. The pin was never the cause — a run between the 20th and
23rd died on `git push … ! [rejected] (non-fast-forward)` because Oracle's clone
was behind the remote, and it recovered on its own.
(Superseded handoff: `docs/oracle/HANDOFF_2026-08-21_TELEGRAM_BLOG_PIN.md`.)

### ✅ The outreach email sender is whole on `main` (fixed 25 Aug)

Both halves of the one-click outreach email now live on `main` and are live on
Oracle:

- **Cc** — `d9b2f30` (carry a Cc) + `d9270e6` (record it in HubSpot, stop the
  timeline gluing the link). Was already on `main`.
- **PDF attachments** — MIME attach via Resend, built by the Cursor agent. This
  existed **only** on `cursor/intelliops-bd-money-play-abc0` and as an
  uncommitted file on Oracle's disk, so building `main` produced a sender with
  **zero** attachment support and any full `dist/` sync would have silently
  destroyed it. `src/go-wa.ts` from that branch is now on `main`.

**Verified:** building `main` and normalising CRLF→LF reproduces Oracle's live
`dist/go-wa.js` exactly — md5 `e469dacf07a165a5df8931fde1dead26`. Attachments
are constrained to `docs/selling/attachments/`, ≤5 MB, magic-byte checked, and
the payload is **refused** if a listed file fails to load — so an email never
claims a resume it did not attach.

**Updated 4 Sep 2026 — attachments are no longer PDF-only.** `.docx` is allowed
(magic `PK\x03\x04`) because a contract the counterparty still has to SIGN
cannot be flattened to PDF: Datastar signs the NDA after Elena and produces the
PDF themselves. The Resend `content_type` follows the extension instead of being
hardcoded to `application/pdf`, which had delivered an unopenable file. Gate
tests: `node scripts/test-outreach-attachments.cjs` (24 checks — traversal,
absolute paths, `.exe`/`.zip`, a display name claiming a different type than the
file, a `.docx` that is not a zip). **Do not narrow this back to `.pdf`.**

📎 **An attachment must also land IN HubSpot, not only in the Resend payload.**
A file that exists only in the repo leaves a deal showing a letter that claims a
document and carries none, and the HubSpot UI Email option has nothing to
attach. `scripts/hs-files.cjs` uploads to `/outreach-attachments` with
`access: PRIVATE`; `stage-hiring-outreach.cjs` does it for every staged deal;
`hs-attach-deal-files.cjs --slug=<slug>` backfills. Needs the **`files`** scope
on the Service Key — and Files **read** does not imply Files **write**.

Still deploy **named files only** as a habit: Oracle's checkout sits at
`d9270e6` with a dirty `src/go-wa.ts` (same content, now also on `main`), and
other agents may hold work on that box that git has never seen.

### Duplicate blog content — source fixed 25 Aug, cleanup still open

The daily publisher shipped near-duplicates for months: **56 of 121 pages are
near-copies**, in 19 cannibalising clusters, back to 18 May. The old guard tested
*exact* slug equality, so reworded titles sailed through, and when it did fire it
appended a date and published anyway — a green log every time.

Fixed at the source, in two halves. **Detection:** the publisher scores **token
overlap** against every published post instead of testing slug equality, and the
dedup cache was backfilled **64 → 123** entries (it could previously see only
half of what was live). **Supply:** refusing alone would have bought quality with
silence, and *the blog must still post every day*. So the 20-brief rotation is no
longer the only source — spent briefs are now correctly excluded (11 of 20 are
spent; the old substring test excluded almost none), the last 30 titles are named
in the prompt as off-limits, and the angle is **derived from that day's
measured evidence** — commits, wiki incidents, operator queue, outcome lines —
which never runs out. A duplicate is a *retryable* gate (4 attempts, each told
to pick a different angle).

**26 Aug 2026 — grounding gate was skipping the day.** The 14:30 Panama cron
ran and Telegram said `Grounding gate / unsourced number(s): 40`. The scheduler
was not off. A rotation brief still asked for `BrightData $40/run` (and `76%`,
`300` duplicate deals, `131` tests). Grounded mode collected real facts, then
handed the model a brief full of unverified figures; the model copied `40`;
four retries later the gate fail-closed and published nothing. Same shape as
the near-duplicate silence: the filter was correct, the cadence was not.

Cadence fix: briefs are not sources (digits stripped before they reach the
model), today's Claude/Cursor work is collected as evidence, an unsourced
paragraph is salvaged rather than discarding the draft, and if the model still
cannot stay inside the bundle a **measured-notes article is assembled
deterministically** from the facts. Silence remains correct when there is
nothing to measure (`< MIN_FACTS`). Silence is incorrect when the day produced
evidence and the model decorated it.

**26 Aug wiki: yes, blog: no.** This session earned a wiki chapter
(`2026-08-26-prompt-poisoned-the-grounding-gate`, concept `the-prompt-is-a-source`).
It hit production, transfers, is verified from Telegram + the live pin, and names a
new failure mode. It does **not** earn a second blog post: today's daily article
already shipped, and the pin 404 Elena saw is the existing `git-is-not-the-origin`
chapter, not a new one. Marked `blog: no` so `wiki-ship.cjs` will not cross-post.

**Wiki-worthy sessions still publish to the blog the same day**, even if the
daily post already ran. `wiki-ship.cjs` (21:30 UTC) runs after the daily job
(19:30 UTC) and publishes any incident marked `blog: yes` via
`incident-to-blog.cjs`, which does **not** go through the daily guarded path —
so the duplicate guard cannot block it. Two posts in one day is correct
behaviour, not a bug.

**Still open:** ~50 already-published duplicates need canonical consolidation.
**Canonical only — do not delete.** 21 published pages contain the fabricated
Redis stack (see the 23 Aug incident), so never canonicalise *onto* one of those.

---

## 1. Close every session by teaching the concept

A fix is half-delivered when the code works. The other half is that Elena can
explain, in an interview, what broke and what the pattern is **called**.

She passes technical interviews and then gets rejected. She builds genuinely
senior systems and describes them as "I wired X to Y". Hiring managers listen
for the named concept — *single point of failure*, *silent failure*,
*idempotency*, *acknowledgement is not completion* — because that vocabulary is
how they verify the experience is real. She has done the work; she loses on the
telling.

So end substantive sessions with: **what broke → why → what it is called.**

- Plain words. Analogies from ordinary life, not from other codebases.
- Give the **named concept** every time. The vocabulary is the point.
- Never condescend. She is an ex-Deputy CEO who ships production systems solo;
  she needs the label and the reasoning, not a beginner's tutorial.
- Where it fits, hand her one ready-to-say interview line built from what
  actually happened, with real numbers — never anything unverified.
- Tie it to her lanes: AI-augmented builder / GEO-AEO-Tech-SEO /
  AI-automation solutions architect. Not ML researcher.

## 2. Publish the ones that earn it

Two destinations, both selective. **Routine work earns neither.**

### The bar — a session qualifies only if ALL of these hold

1. It hit a **real production system**, not a local experiment.
2. The lesson **transfers** — someone on a different stack would recognise the
   shape and avoid the same trap.
3. Something is **verifiable**: a log line, a measured number, a before/after.
4. It has a **named failure mode**, or earns a new one.

Explicitly NOT qualifying: routine deploys, dependency bumps, config edits,
copy changes, anything already covered by an existing entry, and anything whose
write-up would need a fact we did not verify. **When in doubt, leave it out** —
the corpus is the asset, and one padded entry devalues all of it.

### Destination A — the AI Ops Wiki (always, when it qualifies)

`https://aideazz.xyz/ai-ops-wiki.html` — see the `project_ai_ops_wiki` memory.

- Add ONE incident file to `content/ai-ops-wiki/incidents/` in the **aideazz**
  repo (front-matter only; **must end with a closing `---`**).
- Add a concept file only if it is a genuinely new failure mode.
- Run `node scripts/generate-ai-ops-wiki.mjs`. **Never hand-edit the HTML** —
  it is overwritten every build.
- Leak-scan before publishing. Push **without** `[skip ci]` or 4everland will
  not rebuild.

### Destination B — the blog (only the strongest)

Her blog is the visible half of her AEO/GEO/Tech-SEO machine, so a weak post
costs more than no post. Mark the incident `blog: yes` only when it would stand
on its own in front of a stranger.

```bash
node scripts/incident-to-blog.cjs --list
node scripts/incident-to-blog.cjs <slug>            # draft only, publishes nothing
node scripts/incident-to-blog.cjs <slug> --publish  # blog page + Dev.to canonical
```

The article is assembled **deterministically** from the incident's verified
fields. There is no generation step, so there is nothing to hallucinate. Keep
it that way: *"I do not want to scam anybody"* is a hard constraint, not a
preference. Never let a model re-tell an incident.

## 3. Never publish anything unverified

- Verify from **logs, not config**. Grep the line that proves the behaviour
  happened, and quote it. A key that exists proves nothing about the balance
  behind it.
- No customer data, emails, credentials, hostnames, IPs, ports, or internal
  record identifiers (HubSpot deal/contact ids) on any public page.
- If a number cannot be shown from production, it does not go in.

## 4. Standing rules for this repo

- **Never `git add -A`** here — stage named files only.
- Build locally, `scp` to Oracle, then **always `pm2 restart cto-aipa
  --update-env`**. Node caches modules; a copied file with no restart means the
  running process and the file on disk silently disagree.
- After any deploy, prove it: `grep` the compiled `dist/` for the change, and
  check the process start time is newer than the file.
- Never wipe or overwrite anything not created in this session without a backup
  and an explicit go-ahead.
- Contract for anything touching Oracle, `main`, or PM2:
  **Teach → Plan → Confirm → Build → Document.** A status question is not
  authorisation to deploy.
- Wire it *and* fire it. She is a single mother working on the go — do not end a
  turn with steps for her to run herself.
