# Sync audit — 5 Nov 2026 (~13:00 UTC), Claude Code

Elena: "verify that all latest days enhancements are synchronized and updated everywhere across Git repo, Oracle and local."
Verdict: **everything that RUNS equals GitHub `main`.** Gaps found were bookkeeping (git markers, stale artifacts), not missing features.

## Laptop ↔ GitHub (20 repos)
| Repo | State |
|---|---|
| cto-aipa, ascent-saas-builder, aideazz, atuona, EspaLuzFamilybot, EspaLuzWhatsApp, EspaLuz_Influencer, VibeJobHunter, dragontrade-agent, whitespace, aideazz-ops-dashboard, aideazz-podcast, AILA, aw-portal, hive | ahead 0 / behind 0 |
| job-list-filter (was behind 15), atlas-captures (was behind 3) | fast-forwarded today → 0/0 (clean trees, no local work) |
| handy_manny-s | behind 2 + local edits to WEEK3 plan/package.json (March project) — left alone |
| aideazz-private-docs | laptop checkout is the OLD `docs` branch with 53 files deleted from disk (images/docs; deletions only). Real work lives on `origin/main` (44 commits ahead of local `main`, committed from worktrees). Not touched — restoring or committing those deletions is Elena's call. |
| manukora-sop-brief | no remote (local only, Aug) |
| cto-aipa uncommitted | local reports (`_evaluate_send_report.json`, `_install-wa-fu-notes.json`), `.claude/launch.json`, an answers doc, and `dist-lambda/sprint/lambda-pkg/handler.js` (see Lambda) — none is runtime |

## Oracle — running files vs GitHub
| Service | Proof |
|---|---|
| **cto-aipa** (PM2) | built `main` on the laptop (`tsc`): **98/98 `dist/*.js` identical** to Oracle (CRLF-normalised md5), none missing either side. Newest file 4 Nov 20:25:42, process started 20:25:54. All **29 cron-run scripts** (cto-aipa + VJH) = `origin/main`. Checkout HEAD lags by design (named-file deploys) — not re-pointed. |
| **EspaLuzFamilybot** | every tracked `.py` = `origin/main`; the 3 untracked runtime files (`fair_use`, `espaluz_payment_truth`, `aideazz_service_payments`) md5 = GitHub. HEAD re-pointed 49 behind → 0/0. |
| **EspaLuzWhatsApp** | 13 files show as changed → **0 real line changes** (CRLF + chmod only). HEAD re-pointed 48 → 0/0. Oracle-only leftovers `check_subscribers.py` (Feb, holds a phone number) and `whatsapp_mode_state.py` (Jan) are imported by nothing — left, not committed (PII). |
| **EspaLuz_Influencer** | code = GitHub; HEAD 7 → 0/0. |
| **VibeJobHunter** | code = GitHub (`kit_verdict_vs_decision.py` md5 equal); HEAD 11 → 0/0. |
| **dragontrade-agent** | every `.js` = `origin/main` (only `test-oracle-db.cjs` differs). HEAD carries 1 Oracle-only commit `3ad5d5a` (same subject as GitHub `89d4125`) → NOT re-pointed, would orphan it. |
| services | 4 EspaLuz/VJH systemd units active since 4 Nov 19:30 reboot; openclaw-gateway active; PM2 all online except **`algom-stream` crash-looping on "X account has no credits" (1,995 restarts since reboot)** — known, Elena's call (NOW.md: top up X or `pm2 stop`). |

HEAD re-point = `git reset --mixed origin/main` (moves the marker, touches no file). Old HEADs saved: `~/_session-backups/git-heads-before-repoint-20261105.txt`.

## Hosted
| Place | Proof |
|---|---|
| app.espaluz.lat (Lovable) | live bundle `index-DMnKhz6M.js` contains `creator-qr-card`, "AI-augmented engineering", "Programa a Titi", "Create my free account" → **published = ascent `main` incl. today's QR**. |
| Supabase (13 functions) | all redeployed 4 Nov 17:12:40 UTC; last function commit `f4d54df` 17:11:48 UTC; nothing in `supabase/functions` since → in sync. `verify_jwt=false` only on `telegram-webhook` + `connect-telegram-bot` (= config.toml, intended). |
| aideazz.xyz | `geo-manifest.json` updated 2026-11-04 = last `main` commit `6bad765` (4 Nov). `/card` 301 → `/portfolio` 200. |
| atuona.xyz, podcast.aideazz.xyz | 200 |
| AWS Lambda `sprint-briefing-agent` | deployed 26 Oct 13:35; `src/sprint-briefing/*` unchanged since (`c365be4e`, 26 Oct). Later `llm-resilience.ts` commits (30 Oct) add exports the Lambda does not call (it uses only `grokComplete`) → functionally current. ⚠️ The `handler.js` committed in git is an OLDER build than live, and the laptop's modified copy is a third version — artifact only, not runtime. |

## Open (not done here)
1. `algom-stream` crash loop — Elena: top up X credits, or say "stop it".
2. private-docs laptop checkout: 53 deleted files on old `docs` branch — Elena: restore or let them go.
3. Lambda artifact in git ≠ live — next Lambda deploy should commit the zip it ships.
