#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/cto-aipa

echo "=== preflight ==="
grep -q GOOGLE_ANALYTICS_CREDENTIALS .env && echo "GA creds: present" || { echo "GA creds: MISSING"; exit 1; }
grep -q GA4_PROPERTY_ID .env && echo "GA4_PROPERTY_ID: present" || echo "GA4_PROPERTY_ID: default 515154124"

echo "=== git pull + build ==="
git pull origin main
npm run build
pm2 restart cto-aipa --update-env
sleep 4

echo "=== dry-run ==="
node scripts/sync-atlas-ga4.mjs --dry-run

echo "=== live run ==="
node scripts/sync-atlas-ga4.mjs

echo "=== verify ledger ==="
SECRET=$(grep '^OUTREACH_SECRET=' .env | cut -d= -f2- | tr -d '\r')
curl -sf -H "Authorization: Bearer ${SECRET}" http://127.0.0.1:3000/api/atlas-performance \
  | python3 -c "import sys,json; d=json.load(sys.stdin); s=json.dumps(d); print('concepts:', len(d.get('concepts',{}))); print('ga4_sessions in response:', 'ga4_sessions' in s)"

echo "=== install cron ==="
mkdir -p /home/ubuntu/logs
( crontab -l 2>/dev/null | grep -v sync-atlas-ga4 || true
  echo '15 6 * * * cd /home/ubuntu/cto-aipa && /usr/bin/node scripts/sync-atlas-ga4.mjs >> /home/ubuntu/logs/atlas-ga4-sync.log 2>&1'
) | crontab -
crontab -l | grep sync-atlas-ga4

echo "=== DONE ==="
