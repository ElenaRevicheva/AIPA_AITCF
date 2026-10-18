# Daily blog fact-check — 16 and 17 Oct 2026 articles

Read-only check, 17 Oct 2026, against production evidence (pm2 logs and counters, git history, the publisher's
cache, Buffer's API). Every problem was re-checked by a second, independent pass that tried to refute it.
Nothing was edited, unpublished or deployed by this check. **No names, hostnames or ids in this file on purpose** —
the repo is public.

## Where they went

| | aideazz.xyz | LinkedIn (Buffer, `sent`) | Bluesky | Bing (IndexNow) |
|---|---|---|---|---|
| 16 Oct `cto-aipas-216-restarts-iterating-deal-sheets-by-stage` | live | sent | posted | 200 |
| 17 Oct `vjh-qa-bilingual-logic-fixing-english-questions-answered-in-spanish` | live | sent | posted | 200 |

## Verdict

- **16 Oct — the central story is false, and the body leaks job-application targets.** 13 claims verified,
  7 misleading, 8 false. The title and FAQ present pm2's LIFETIME restart counter (216) as the result of the last
  48 h of deal-sheet work ("216 times in 0 days"). In fact only 13 restarts fell in those 48 h, every surviving
  restart since 28 Sep is a deliberate `pm2 restart` deploy (0 crashes), and the deal-sheet change (`6e32c38f`)
  lives in a cron script that needs no restart. "12 commits" was really 66. "algom-stream 55193 restarts over
  61 days" is backwards: 61 days of uptime means ZERO restarts in that window (the counter froze after a crash loop
  that ended 16 Aug). The body quotes the `6e32c38f` subject word for word, which lists eight employers she has
  live applications with. The LinkedIn copy carries no names, but repeats "216 restarts in 48 hours" and
  "Each commit forces a restart" — both false. The Bluesky card carries the false title.
- **17 Oct — the core story is true; five lines are not.** The VJH bilingual fix is real (conscience eval re-run:
  parent 17 failed → `5204521` 23 passed → `0215cb0` 26 passed; service restarted 7 s after the commit). False or
  misleading: the restart counters again, "algom-stream 55193 restarts over 62 days", "12 commits" (really 38),
  "14 in decisionmakerboughtin according to HubSpot totals" (14 = rows listed; the HubSpot total was 73), and the
  language reminder described as telling the USER the language (it is a line in the model's prompt). It also
  publishes two mail-server hostnames with per-mailbox counts (CLAUDE.md §3: no hostnames on public pages).

## Root causes — all in `src/blog-evidence.ts`, all still live

1. **Counter read as a rate.** The pm2 collector emits `N restarts, up Xd` — a lifetime counter beside the current
   uptime. The model reads "N restarts in X days". Same misframing in the 9, 10, 13, 14, 15, 16, 17 Oct posts
   (e.g. "198 restarts within a single day", 9 Oct). **Flagged in this file on 5 Oct and never fixed at the source.**
2. **A display cap reported as a count.** The git collector keeps `| head -12`; the model reports "12 commits".
3. **The scrub misses CRM names and hostnames.** `scrubPublic()` strips emails, tokens, IPs and long ids only. Commit
   subjects and NOW.md (both public, both naming deals) flow into the evidence with company names intact.
4. **Raw HubSpot stage ids** reach the model, which renders `decisionmakerboughtin` as "decision-maker bought in".
5. (15 Oct finding) `collectNowMd` reads Oracle's on-disk NOW.md (13 Oct copy) instead of `origin/main`.

The grounding gate passed all of it: it checks that every number is IN the evidence bundle, not that the sentence
around the number is true. **Provenance is not correctness.**

## Proposed, awaiting Elena's go (public content + Oracle deploy)

- Take the 16 Oct article down (page, sitemap, blog list; IndexNow deletion ping), delete its Bluesky card; Elena
  deletes the LinkedIn post (Buffer cannot delete a sent LinkedIn post).
- 17 Oct: cut the false sentences and the hostname sentence — deletion only, no model rewriting.
- `src/blog-evidence.ts`: drop pm2 restart counters from public evidence; real commit count; scrub HubSpot deal
  company names (from the deals sheet the bots already read) and hostnames; stage ids → plain labels; NOW.md from
  `origin/main`. Tests in `scripts/test-blog-evidence.cjs`; one compiled file to Oracle; restart; dry-run evidence
  bundle shown before the next 19:30 UTC run.
- Older posts repeating "55,193 restarts" (≈50 cached) — list for a later decision.
- Rule for every agent: commit subjects and NOW.md name deals by count or stage, never by employer.
