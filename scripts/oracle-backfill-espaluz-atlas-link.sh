#!/usr/bin/env bash
# Link existing HubSpot [ESPALUZ] deals → expat_language Atlas concept (hubspot_deals + crm_event_log).
set -euo pipefail
cd /home/ubuntu/cto-aipa
SECRET=$(grep -E '^OUTREACH_SECRET=' .env | cut -d= -f2- | tr -d '\r')
HS=$(grep -E '^HUBSPOT_API_KEY=' .env | cut -d= -f2- | tr -d '\r')
CONCEPT="expat_language_2026-06-28"

echo "=== HubSpot [ESPALUZ] deals ==="
DEALS=$(curl -s -X POST "https://api.hubapi.com/crm/v3/objects/deals/search" \
  -H "Authorization: Bearer ${HS}" \
  -H "Content-Type: application/json" \
  -d '{"filterGroups":[{"filters":[{"propertyName":"dealname","operator":"CONTAINS_TOKEN","value":"ESPALUZ"}]}],"properties":["dealname"],"limit":20}')

echo "$DEALS" | node -e "
const j=JSON.parse(require('fs').readFileSync(0,'utf8'));
for (const r of j.results||[]) console.log(r.id, r.properties.dealname);
"

echo "$DEALS" | node -e "
const j=JSON.parse(require('fs').readFileSync(0,'utf8'));
for (const r of j.results||[]) console.log(r.id);
" | while read -r DEAL_ID; do
  [ -z "$DEAL_ID" ] && continue
  echo "Backfill crm-event deal $DEAL_ID"
  echo "{\"source\":\"espaluz_telegram\",\"type\":\"backfill\",\"pipeline\":\"client\",\"userId\":\"backfill\",\"atlas_concept_id\":\"${CONCEPT}\",\"utm_term\":\"${CONCEPT}\",\"utm_campaign\":\"atlas_expat_language\"}" > /tmp/bf.json
  curl -s -w " HTTP:%{http_code}\n" -X POST http://127.0.0.1:3000/api/crm-event \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${SECRET}" \
    -d @/tmp/bf.json
done

echo ""
echo "=== Atlas performance for ${CONCEPT} ==="
curl -s "http://127.0.0.1:3000/api/atlas-performance?concept_id=${CONCEPT}" \
  -H "Authorization: Bearer ${SECRET}" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const j=JSON.parse(d);
  const c=j.concepts&&j.concepts['${CONCEPT}'];
  if(!c){console.log('no concept data');return;}
  console.log('totals:',JSON.stringify(c.totals));
  if(c.hubspot) console.log('hubspot loop:',JSON.stringify(c.hubspot));
});"
