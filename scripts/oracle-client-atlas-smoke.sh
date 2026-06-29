#!/usr/bin/env bash
# Fire CLIENT ↔ Atlas loop: inquiry with atlas UTMs → HubSpot + performance ledger.
set -euo pipefail
cd /home/ubuntu/cto-aipa
SECRET=$(grep -E '^OUTREACH_SECRET=' .env | cut -d= -f2- | tr -d '\r')
INQ=$(grep -E '^MARKETING_INQUIRY_SECRET=' .env | cut -d= -f2- | tr -d '\r')
CONCEPT="ai_marketing_studios_2026-06-28"
CAMPAIGN="atlas_ai_marketing_studios"

echo "=== 1. POST marketing inquiry (Atlas CLIENT tags) ==="
cat > /tmp/inquiry.json <<JSON
{
  "name": "Atlas CLIENT Smoke",
  "email": "atlas-smoke-$(date +%s)@example.com",
  "message": "Fractional CTO inquiry from Atlas client campaign smoke test",
  "utm_source": "meta",
  "utm_medium": "paid",
  "utm_campaign": "${CAMPAIGN}",
  "utm_term": "${CONCEPT}",
  "utm_content": "pain_point",
  "page_url": "https://aideazz.xyz/?utm_campaign=${CAMPAIGN}#inquiry-form"
}
JSON
curl -s -w "\nHTTP:%{http_code}\n" -X POST http://127.0.0.1:3000/marketing/inquiry \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${INQ}" \
  -d @/tmp/inquiry.json

sleep 4
echo ""
echo "=== 2. HubSpot + Atlas logs ==="
pm2 logs cto-aipa --lines 25 --nostream 2>/dev/null | grep -iE 'inquiry|HubSpot|atlas-crm|atlas-lead' | tail -12 || true

echo ""
echo "=== 3. Atlas performance for ${CONCEPT} ==="
curl -s "http://127.0.0.1:3000/api/atlas-performance?concept_id=${CONCEPT}" \
  -H "Authorization: Bearer ${SECRET}" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const j=JSON.parse(d);
  const c=j.concepts&&j.concepts['${CONCEPT}'];
  if(!c){console.log('NO_DATA (concept may need first event)');console.log(JSON.stringify(j).slice(0,400));return;}
  console.log('totals:',JSON.stringify(c.totals));
  if(c.hubspot) console.log('hubspot:',JSON.stringify(c.hubspot));
});"

echo ""
echo "=== 4. EspaLuz concept (sanity) ==="
curl -s "http://127.0.0.1:3000/api/atlas-performance?concept_id=expat_language_2026-06-28" \
  -H "Authorization: Bearer ${SECRET}" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const c=JSON.parse(d).concepts&&JSON.parse(d).concepts['expat_language_2026-06-28'];
  if(c) console.log('expat_language totals:',JSON.stringify(c.totals));
});"

echo ""
echo "=== DONE ==="
