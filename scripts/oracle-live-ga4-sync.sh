#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/cto-aipa
git pull origin main 2>/dev/null || true

echo "=== live run ==="
node scripts/sync-atlas-ga4.mjs

echo "=== verify ==="
SECRET=$(grep '^OUTREACH_SECRET=' .env | cut -d= -f2- | tr -d '\r')
curl -sf -H "Authorization: Bearer ${SECRET}" http://127.0.0.1:3000/api/atlas-performance \
  | python3 -c "import sys,json; d=json.load(sys.stdin); s=json.dumps(d); print('concepts:', len(d.get('concepts',{}))); print('ga4_sessions in response:', 'ga4_sessions' in s)"

echo "=== cron ==="
mkdir -p /home/ubuntu/logs
( crontab -l 2>/dev/null | grep -v sync-atlas-ga4 || true
  echo '15 6 * * * cd /home/ubuntu/cto-aipa && /usr/bin/node scripts/sync-atlas-ga4.mjs >> /home/ubuntu/logs/atlas-ga4-sync.log 2>&1'
) | crontab -
crontab -l | grep sync-atlas-ga4
echo DONE
