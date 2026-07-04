#!/usr/bin/env bash
# Deploy /go/wa sidecar on Oracle (CTO AIPA + optional Atlas UI refresh).
set -euo pipefail

echo "=== cto-aipa ==="
cd /home/ubuntu/cto-aipa
git pull --ff-only origin main
npm run build
pm2 restart cto-aipa --update-env
sleep 3

echo "=== smoke /go/wa redirect (no atlas — should 302 wa.me) ==="
code=$(curl -s -o /dev/null -w '%{http_code}' -m 10 \
  'http://127.0.0.1:3000/go/wa?to=50766623757&text=deploy-smoke')
echo "HTTP $code (expect 302)"

echo "=== smoke atlas ledger post via /go/wa ==="
code2=$(curl -s -o /dev/null -w '%{http_code}' -m 10 \
  'http://127.0.0.1:3000/go/wa?to=50766623757&text=atlas-smoke&utm_campaign=atlas_expat_language&utm_term=expat_language_2099-01-01&utm_content=smoke')
echo "HTTP $code2 (expect 302)"
sleep 1
SECRET=$(grep '^OUTREACH_SECRET=' .env | cut -d= -f2- | tr -d '\r')
curl -sf -H "Authorization: Bearer ${SECRET}" \
  'http://127.0.0.1:3000/api/atlas-performance?concept_id=expat_language_2099-01-01' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); c=d.get('concepts',{}).get('expat_language_2099-01-01',{}); print('wa_clicks:', c.get('totals',{}).get('wa_clicks',0))"

echo "=== whitespace (Atlas UI) ==="
if [ -d /home/ubuntu/whitespace/.git ]; then
  cd /home/ubuntu/whitespace
  git pull --ff-only origin main 2>/dev/null || true
  pm2 restart whitespace --update-env 2>/dev/null || true
fi

echo "=== DONE ==="
