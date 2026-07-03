# Pre GA4 Atlas sync backup — 2026-07-03

Git branch: `backup/pre-ga4-atlas-sync-20260703` (points at HEAD before edits)

Files backed up:
- `backups/database.ts.pre-ga4-atlas-sync.bak` — copy of `src/database.ts` before sumMetrics changes

Files added (this implementation):
- `scripts/google-analytics-auth.mjs` — shared JWT helper for GA4/GSC scripts
- `scripts/sync-atlas-ga4.mjs` — nightly GA4 → performance ledger adapter

Files modified:
- `src/database.ts` — `AtlasPerformanceMetrics` + `sumMetrics()` extended for `ga4_sessions`, `ga4_key_events`, `wa_clicks`

Restore: `Copy-Item backups/database.ts.pre-ga4-atlas-sync.bak src/database.ts` and delete new scripts; or `git checkout backup/pre-ga4-atlas-sync-20260703 -- src/database.ts`

Oracle deploy (after dry-run on server):
```bash
cd /home/ubuntu/cto-aipa && git pull
node scripts/sync-atlas-ga4.mjs --dry-run
# Elena confirms, then:
node scripts/sync-atlas-ga4.mjs
# cron: 15 6 * * * cd /home/ubuntu/cto-aipa && /usr/bin/node scripts/sync-atlas-ga4.mjs >> /home/ubuntu/logs/atlas-ga4-sync.log 2>&1
```

Enhancements vs runbook:
- Idempotency via Oracle `notes=ga4_sync|vertical|angle|date` (re-run safe)
- Uses `period_start`/`period_end`/`notes` (no invalid `metadata` field)
- `--date YYYY-MM-DD` for manual backfill
- `google-analytics-auth.mjs` shared module (no duplicated JWT)
- Hub metrics aggregated in `sumMetrics` for Atlas UI totals
