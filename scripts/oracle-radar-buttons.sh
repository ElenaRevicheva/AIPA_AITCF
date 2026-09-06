#!/usr/bin/env bash
# Named-file deploy of Follow-up radar Clean / Keep buttons.
#
# Does NOT `git reset`, does NOT `git pull`, does NOT touch docs/selling,
# .env, data/, or any file this session did not write. Oracle's checkout is
# allowed to lag main; this copies two source files and rebuilds.
set -euo pipefail

AIPA_DIR=/home/ubuntu/cto-aipa
if [ ! -d "$AIPA_DIR/.git" ] && [ -d /home/ubuntu/AIPA_AITCF/.git ]; then
  AIPA_DIR=/home/ubuntu/AIPA_AITCF
fi
cd "$AIPA_DIR" || { echo "FATAL: no cto-aipa checkout"; exit 1; }

echo "=== BEFORE (no reset, no pull) ==="
echo "dir=$AIPA_DIR user=$(whoami)"
git rev-parse --short HEAD
echo "--- dirty (first 40; we will not wipe these) ---"
git status --porcelain | head -40
echo "--- pm2 before ---"
pm2 describe cto-aipa 2>/dev/null | grep -E 'status|uptime|restarts' || true

echo "=== fetch origin/main ==="
git fetch origin main

echo "=== named checkout: radar sources + force-send (no reset) ==="
git checkout origin/main -- \
  src/telegram-bot.ts \
  src/radar-cleanup.ts \
  scripts/post-radar-buttons-now.cjs \
  scripts/oracle-radar-buttons.sh

echo "=== build (typescript is a devDep and was pruned on the last full deploy) ==="
# Do not npm ci / prune — that would rewrite node_modules. Install tsc only.
if [ ! -x node_modules/.bin/tsc ]; then
  npm install --no-save typescript@5.9.3
fi
./node_modules/.bin/tsc

echo "=== prove compiled output carries the buttons ==="
grep -c "postRadarButtonsOnce" dist/telegram-bot.js
grep -c "rdrcleanall" dist/radar-cleanup.js
grep -c "discoverRadarProposal" dist/radar-cleanup.js
grep -c "parseRadarDigest" dist/radar-cleanup.js

echo "=== copy last digest into data/ without printing it ==="
mkdir -p data
echo "--- radar paths (no contents) ---"
find /home/ubuntu/cto-aipa /home/ubuntu/VibeJobHunterAIPA_AIMCF /home/ubuntu/logs /home/ubuntu/.pm2/logs \
  \( -iname '*radar*' -o -iname '*followup*' \) 2>/dev/null | head -40 || true
echo "--- crontab radar ---"
crontab -l 2>/dev/null | grep -i radar || true
COPIED=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  case "$f" in *.ts|*.js|*.cjs|*.d.ts|*.map) continue ;; esac
  if grep -q "Follow-up radar" "$f" && grep -Eq '[0-9]+d[[:space:]]+[^[:space:]]+@' "$f"; then
    cp -f "$f" data/followup-radar.log
    echo "digest_source=$(basename "$f") bytes=$(wc -c < "$f")"
    COPIED=1
    break
  fi
done < <(find /home/ubuntu/cto-aipa /home/ubuntu/VibeJobHunterAIPA_AIMCF /home/ubuntu/logs /home/ubuntu/.pm2/logs /tmp \
  \( -iname '*radar*' -o -iname '*followup*' \) -type f 2>/dev/null || true)
if [ "$COPIED" -eq 0 ]; then
  echo "digest_source=none (will try HubSpot open tasks; leftover cleared proposal is ignored)"
fi
rm -f data/radar-buttons-sent.json

echo "=== force-post buttons NOW (addresses never printed) ==="
SEND_RC=0
node scripts/post-radar-buttons-now.cjs --if-missing || SEND_RC=$?
echo "force_post_exit=$SEND_RC"

echo "=== restart so callback handlers match the new proposal ==="
pm2 restart cto-aipa --update-env
sleep 4
echo "--- pm2 after ---"
pm2 describe cto-aipa 2>/dev/null | grep -E 'status|uptime|restarts' || true
echo "--- radar log lines (no addresses) ---"
pm2 logs cto-aipa --lines 40 --nostream 2>/dev/null | grep -E '\[radar\]' || true

echo "=== AFTER ==="
git status --porcelain -- src/telegram-bot.ts src/radar-cleanup.ts scripts/post-radar-buttons-now.cjs
echo "=== Done. docs/selling, .env, data/ ledger left in place. ==="
exit "$SEND_RC"
