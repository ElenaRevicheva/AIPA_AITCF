# CI&T "[Job - 32354] AI Solution Architect" — where VJH found it, and is DailyRemote a scam?

**Date:** 24 Oct 2026 · **Deals:** 66619289430 (kit, DailyRemote URL) and 66678401330 (parked, Lever URL)

## Where VJH found it — verified from the Oracle log

Process `serpapi-jobs` (Bright Data Google search, 18 paid queries every 12h). Python logs to
stderr, so the run is in `~/.pm2/logs/serpapi-jobs-error__2026-10-24_00-00-00.log.gz`, not the
0-byte out-log:

```
[SerpJobs] Querying Google Jobs: 'AI workflow architect remote latin america'
[SerpJobs] BrightData empty body (...) — retrying once in 2s
[SerpJobs] BrightData retry OK (...): 25644 bytes
[SerpJobs]   → 10 results
[SerpJobs]   + [Job - 32354] AI Solution Architect, Brazil at CI&T @ CI&T ()
[SerpJobs] [enrich] 150c → 8000c from https://dailyremote.com/remote-job/job-32354-ai-solution-architect-bra
[SerpJobs]   read full posting (150 → 8152 chars): ...
[SerpJobs] CRM push error: ... webhook.aideazz.xyz ... Read timed out. (read timeout=45)
[SerpJobs]   IRON-CLAD FIT + judge OK, CRM outcome UNKNOWN (...) — check HubSpot: [Job - 32354] ...
```

The deal was created 23 Oct 06:13:37 UTC (the webhook finished after VJH's 45 s timeout — a
timeout is not a failure). `hs-fill-apply-kit` then built the kit 06:20–06:30 UTC.

**How a DailyRemote link got through a query restricted to Lever/Greenhouse/Ashby/Wellfound:**
`JOB_BOARD_SITES` is a `(site:a OR site:b …)` group appended to the query. Google treats that as a
hint, not a contract, and returned `dailyremote.com`. Nothing in `fetch_google_jobs()` checks the
result host afterwards. **Named concept: filter leak** — a restriction expressed to a third party
is not enforced until your own code enforces it.

## What DailyRemote is

- Domain live since at least Dec 2019 (Wayback). ScamAdviser, G2 and remote-job review sites call
  it legitimate. Stripe checkout, 24 h refund.
- **It is a paywalled aggregator, not a source.** Its copy of this job hides the company, says
  "Brazil" in the title and "Colombia" in the location, and every Apply button goes to
  `dailyremote.com/get-started` — the $14.95/mo · $69.95/yr · $149 lifetime page in Elena's
  screenshots. It never links to the employer.
- **Not a scam in the legal sense; a toll booth on a free road.** The same posting is free on
  CI&T's own Lever board.

## The real posting

`https://jobs.lever.co/ciandt/989a2fd5-f970-4c05-a379-5035cd24ec39` — created on Lever
21 Oct 2026, title **"[Job - 32354] AI Solution Architect, Colombia"**, location Colombia /
Homeoffice, **"Fluent English (written and spoken) and Spanish"**, Portuguese a plus, 6+ years.

VJH found THIS one on 24 Oct 06:27 UTC and **parked** it (`not iron-clad fit`): the real text
names Colombia and requires fluent Spanish. The DailyRemote copy, mislabeled "Brazil" with the
eligibility stripped, had passed the gate and the judge the day before.

**Named concept: data provenance / canonical source.** A re-hosted copy is not the posting. The
gate judged a different document than the one the employer wrote.

## State in HubSpot (not changed by this check)

| Deal | URL | Stage | Has kit |
|---|---|---|---|
| 66619289430 | dailyremote.com (paywall) | applied / I Act TODAY | yes — brief, 🎯, 🛡️ + CV, ✅, 📋 |
| 66678401330 | jobs.lever.co/ciandt (origin) | lead_parked | no |

Two deals for one job breaks the one-source-of-truth rule (23 Oct). The kit deal carries the
wrong link; the Comet prompt would open the paywall.

## Elena's decision

1. Apply or not: origin says Colombia + fluent Spanish. Her Spanish is intermediate. The letter
   and CV are ready if she wants to try anyway — on the **Lever** link, never through DailyRemote.
2. Repoint deal 66619289430's Job URL to the Lever URL and merge/park the duplicate.
3. ~~Code fix in VJH~~ **DONE 24 Oct 12:00 UTC** (VJH `aa3b943`, `8db8144`, `e34fa06`), on Elena's
   rule *"dig the true initial board where the job is posted and inspect this job on the criteria
   VJH has"*: a result from outside the four boards is resolved to its origin (remembered boards →
   the board's public API → one paid search to learn the board), the gate and judge read the
   origin text, the deal carries the origin URL, no origin = no deal. Verified live on Oracle: the
   DailyRemote copy resolves to the Lever URL above. Measured on the way: Google's top 10 for the
   `site:`-restricted query held Workday, Builtin and LinkedIn, and the same search answered
   differently run to run, so the resolver reads the board's own API instead of trusting Google.

## Interview line

"My job-search agent restricted Google to four ATS domains, and Google still returned an
aggregator's copy. The copy was mislabeled, passed my fit gate, and the original from the
employer failed it the next day. Lesson: a filter you hand to a third party is a hint, not a
contract — I now enforce the allow-list in my own code, and I treat re-hosted data as
unverified until I find the canonical source."
