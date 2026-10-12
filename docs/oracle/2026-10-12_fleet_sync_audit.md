# Fleet sync audit — laptop = GitHub = Oracle disk = running process (12 Oct 2026)

Asked by Elena: "make sure all codebases across Oracle, laptop and git repo are in sync … products running in latest
versions." Method: 7 read-only investigators (one per product group) + a merge pass; then named-file fixes by Claude
Code, one service at a time, backups in `~/_session-backups/fleet-sync-20261012/`.

## Result — every running process runs its newest code (checked 19:2x UTC)

| Process | Started (UTC) | Newest code it loads | |
|---|---|---|---|
| cto-aipa (PM2) | 10-08 23:27 | dist 10-08 23:27 — all 93 dist/*.js = a build of origin/main | OK |
| whitespace (PM2) | **10-12 19:21** (restarted) | dist 09-14 | OK |
| dragontrade-main / dashboard / algom-stream / algom-poll (PM2) | 10-08 / 08-16 / 08-16 / 07-28 | each entry's own imports are older than its start (alerts.mjs is loaded only by main) | OK |
| serpapi-jobs (PM2) | **10-12 19:21** (restarted) | llm_judge.py 10-12 12:24 (time-zone fix) | OK |
| vibejobhunter (systemd) | 10-12 12:25 | llm_judge.py 10-12 12:24 | OK |
| vibejobhunter-web (systemd) | **10-12 19:20** (restarted; was 10-01 with the pre-5-Oct ATS scraper) | 10-12 12:24 | OK |
| espaluz-familybot / payments-webhook / whatsapp / influencer (systemd) | 10-01 06:58 | 08-17 / 09-29 / 09-04 / 09-15 | OK |
| aw-portal (systemd) | 10-09 06:00 | 06-16 | OK |
| openclaw-gateway (user systemd) | 10-12 00:03 | 10-12 00:03 (billing-pattern patch) | OK |

Laptop = GitHub for every repo (0 ahead / 0 behind) after: atlas-captures fast-forwarded to `e42fb76`, AILA local
`main` ref moved to `aa477b1`.

## Done in this sync
1. **Backup of Oracle-only Atlas leads** — Oracle `~/cto-aipa` local main holds 4 auto-commits that are not on GitHub
   on purpose (prospect data; repo public until ~20 Nov): 21782df, 90d402a, 5325e2c, **782abc2 (12 Oct, 8 drafts +
   registry)**. 782abc2 had no copy anywhere. Bundle: laptop `D:/aideazz/_private-backups/atlas-stranded-20261012/
   stranded-atlas-782abc2.bundle` (`git bundle verify` → is okay). Never push it to GitHub.
2. **Oracle cto-aipa `src/` + `.gitignore` = origin/main** (22 files; 94/94 tracked files now match). src/ was older than
   the running dist, so a build on Oracle would have put September code into the live bot. Running dist untouched
   (`dist/cto-aipa.js` md5 `7a68bac2…`, PM2 start unchanged). The new `.gitignore` hides the 127 auto-built CVs.
3. **vibejobhunter-web restarted** (new run `20261012-192051`, `/health` 200).
4. **serpapi-jobs restarted** so the Bright Data door uses the 12 Oct judge (Pacific/Mountain hours). It ran a search at
   once (18 queries). The run before it (18:58) found 78 new jobs — the Bright Data top-up works.
5. **whitespace** `git pull --ff-only` 7842c75 → 48ecab5 (non-runtime script) + restart (`:8095` 200).
6. **OpenClaw /cards** showed 0 answers since 11:30 UTC: `/new` renames a session to `<uuid>.jsonl.reset.<time>` and the
   card builder read only `*.jsonl`. Fixed (job-list-filter `9b5038f`); rebuild → 6 answers across 2 roles.
7. Laptop guards: 8 old migration scripts in dragontrade-agent and `deploy.zip` in EspaLuzWhatsApp added to
   `.git/info/exclude` (never committed by accident; nothing deleted).

## Deliberate — do NOT "fix"
- Oracle `~/cto-aipa`, `~/EspaLuzFamilybot`, `~/EspaLuzWhatsApp`, `~/dragontrade-agent` checkouts lag origin on purpose.
  **Never `git pull` / `reset` / `clean` there**: it would delete customer data (EspaLuz subscriber JSONs, the 180 MB
  WhatsApp login `.wwebjs_auth`) and the Oracle-only Atlas commits. Deploy cto-aipa by named-file scp only.
- **Never deploy cto-aipa via `deploy-product.sh PRODUCT=cto_aipa` / `.deploy-trigger`** — it runs
  `git reset --hard origin/main` + `git clean -fd docs/selling/drafts/` on Oracle (would wipe the Atlas commits and the
  drafts behind live send buttons).
- The 10-line `AIDEAZZ_SVC_HOOK` block in Oracle's `paypal_webhook_server.py` is the live $100-Diagnostic payment
  router (see ORACLE_ALL_PRODUCTS_RESILIENCE.md). Oracle wins.
- Stashes on Oracle (VJH 2, Familybot 2, EspaLuzWhatsApp 5, whitespace 3) and on the laptop: some are the only copy of
  old work. Never `git stash drop/clear`.

## Elena's decisions (not needed for sync)
- **EspaLuz PII refactor** (Sep) is on GitHub but not live on Familybot (6 files) / WhatsApp (10 files) — a deliberate
  hold; deploying it is a behaviour change for paying users (named files, keep the payment hook, off-peak restart).
- 2 Cursor Cloud branches never merged: `origin/cursor/atlas-classify-failed-1e36`, `origin/cursor/intelliops-addendum-ded9`
  — merge or archive.
- Laptop-only work products not in git (Rwazi application, MICRO1 prep, money blueprint, resume …): commit only after
  ~20 Nov (public repo, personal data).
- Sprinter Lambda: confirm the deployed CodeSha256 (needs an AWS call).
