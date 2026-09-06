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

echo "=== named checkout: src/telegram-bot.ts src/radar-cleanup.ts ==="
git checkout origin/main -- src/telegram-bot.ts src/radar-cleanup.ts

echo "=== build (local tsc — no npm ci, no prune, no npx download) ==="
if [ -x node_modules/.bin/tsc ]; then
  ./node_modules/.bin/tsc
elif [ -f package.json ]; then
  npm run build
else
  echo "FATAL: no local tsc and no package.json"; exit 1
fi

echo "=== prove compiled output carries the buttons ==="
grep -c "postRadarButtonsOnce" dist/telegram-bot.js
grep -c "rdrcleanall" dist/radar-cleanup.js
grep -c "parseRadarDigest" dist/radar-cleanup.js

echo "=== restart ==="
pm2 restart cto-aipa --update-env
sleep 4
echo "--- pm2 after ---"
pm2 describe cto-aipa 2>/dev/null | grep -E 'status|uptime|restarts' || true

echo "=== AFTER ==="
git status --porcelain -- src/telegram-bot.ts src/radar-cleanup.ts src/radar-cleanup.ts
echo "=== Done. docs/selling, .env, data/ untouched. ==="
