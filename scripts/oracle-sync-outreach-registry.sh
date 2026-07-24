#!/usr/bin/env bash
# Sync Manual Prospect email one-click assets onto Oracle.
# Fixes: "Unknown outreach email slug (need email + draft in registry)"
#
# Usage (on Oracle):
#   bash scripts/oracle-sync-outreach-registry.sh
#
# Local agent after staging: commit+push registry+drafts, then run this on Oracle
# (or full: bash scripts/oracle-deploy-go-wa.sh).

set -euo pipefail
cd /home/ubuntu/cto-aipa

echo "=== git pull outreach assets ==="
git fetch origin main
git checkout origin/main -- \
  docs/selling/outreach-registry.json \
  docs/selling/drafts/ \
  src/go-wa.ts \
  dist/go-wa.js 2>/dev/null || true

# Prefer rebuild so GitHub-fallback code is live
if command -v npm >/dev/null 2>&1; then
  echo "=== npm run build (go-wa) ==="
  npm run build
fi

pm2 restart cto-aipa --update-env
sleep 2

SLUG="${1:-grupo-dental-nacional}"
echo "=== smoke /go/outreach-email/${SLUG} ==="
code=$(curl -s -o /tmp/outreach-smoke.txt -w '%{http_code}' -m 15 \
  "http://127.0.0.1:3000/go/outreach-email/${SLUG}" || true)
echo "HTTP $code (expect 200)"
head -c 200 /tmp/outreach-smoke.txt 2>/dev/null || true
echo
echo "=== DONE ==="
