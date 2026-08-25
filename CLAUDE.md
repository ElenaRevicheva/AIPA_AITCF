# How sessions in this repo are run

Elena is learning on the go. Every session must leave her more hireable than it
found her, and the work must be oriented at getting her paid. These rules are
not optional politeness — they are the deliverable.

**Live across Cursor and Claude Code:** there is no shared chat and no Claude
MCP. The live layer is HubSpot + `docs/oracle/NOW.md`. Read that file at
session start. Update it when the money queue changes. Push so the other
tool sees it.

---

## CURRENT STATUS (25 Aug 2026) — the 21 Aug pin blocker is RESOLVED

**Pushing aideazz commits is safe again.** 4everland is publishing: the URL that
used to 404 returns 200, `geo-manifest.json` reads `2026-08-24`, and the 23rd and
24th both pushed clean. The pin was never the cause — a run between the 20th and
23rd died on `git push … ! [rejected] (non-fast-forward)` because Oracle's clone
was behind the remote, and it recovered on its own.
(Superseded handoff: `docs/oracle/HANDOFF_2026-08-21_TELEGRAM_BLOG_PIN.md`.)

### ⚠️ Oracle holds live code that is on NO branch of `main`

Oracle's `dist/go-wa.js` has the MIME-attach sender (20 `attachment` refs,
md5 `e469dacf…`). Building `main` produces a version with **zero** — so a normal
full `dist/` sync from `main` silently destroys the email-attachment feature.
**Deploy named files only. Never rsync the whole `dist/`, never deploy cto-aipa
wholesale from `main`.**

### Duplicate blog content — source fixed 25 Aug, cleanup still open

The daily publisher shipped near-duplicates for months: **56 of 121 pages are
near-copies**, in 19 cannibalising clusters, back to 18 May. The old guard tested
*exact* slug equality, so reworded titles sailed through, and when it did fire it
appended a date and published anyway — a green log every time.

Fixed at the source: the publisher now scores **token overlap** against every
published post and **refuses** (`SKIPPED_BY_COOLDOWN: near-duplicate`) instead of
disambiguating. Oracle's dedup cache was backfilled **64 → 123** entries; it could
previously only see half of what was live.

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
