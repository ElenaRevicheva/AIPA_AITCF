#!/usr/bin/env bash
# Re-run the Monday Atlas lead machine on Oracle after Bright Data is funded.
# Writes HubSpot [CLIENT-ATLAS] deals (max 8). Does not restart PM2.
# Does not git pull cto-aipa (box is meant to lag; it is also on detached HEAD).
set -euo pipefail
AIPA=/home/ubuntu/cto-aipa
if [[ ! -d "$AIPA/.git" ]]; then AIPA=/home/ubuntu/AIPA_AITCF; fi
LOG=/home/ubuntu/logs/atlas-lead-machine.log
cd "$AIPA"

echo "=== host ==="
date -u +%FT%TZ
echo "Panama: $(TZ=America/Panama date +%FT%T%z)"
echo "=== git (do not pull) ==="
git log -1 --format='%h %d %s' || true
git status -sb | head -12
echo "=== retry LEAD_MAX_NEW=8 ==="
# Stay on whatever HEAD the box has. The JS on disk is what Monday cron runs.
set +e
LEAD_MAX_NEW=8 /usr/bin/node scripts/atlas-lead-machine.cjs 2>&1 | tee -a "$LOG"
RC=${PIPESTATUS[0]}
set -e
echo "=== node exit $RC ==="
echo "=== last done line ==="
grep '\[lead-machine\] done' "$LOG" | tail -3
echo "=== lead-machine-run done ==="
exit "$RC"
