#!/usr/bin/env bash
# Read-only dump of the Monday ICP lead machine (up to 8 [CLIENT-ATLAS] deals).
# Cron: 0 16 * * 1 UTC. Does not stage leads, does not restart PM2.
set -uo pipefail
TODAY=$(date -u +%F)
AIPA=/home/ubuntu/cto-aipa
if [[ ! -d "$AIPA/.git" ]]; then AIPA=/home/ubuntu/AIPA_AITCF; fi
LOG=/home/ubuntu/logs/atlas-lead-machine.log

echo "=== host ==="
date -u +%FT%TZ
echo "Panama: $(TZ=America/Panama date +%FT%T%z)"
echo "AIPA=$AIPA"

echo ""
echo "=== crontab (lead machine + Monday Atlas chain) ==="
crontab -l 2>/dev/null | grep -E 'lead-machine|atlas-lead|atlas-campaign|atlas-outcomes|hs-outcomes|0 16 \* \* 1|0 14 \* \* 1|15 15 \* \* 1|30 15 \* \* 1' || echo "(no matching cron lines)"

echo ""
echo "=== running now ==="
pgrep -af 'atlas-lead-machine' || echo "none"

echo ""
echo "=== log file ==="
if [[ -f "$LOG" ]]; then
  ls -l --time-style=long-iso "$LOG"
  echo "--- start/done/LANE/WARN (last 40 matching) ---"
  grep -E '\[lead-machine\]|PUBLISH FAILED|supply:' "$LOG" | tail -40
  echo "--- last 60 lines ---"
  tail -60 "$LOG"
else
  echo "MISSING $LOG"
  echo "--- find ---"
  find /home/ubuntu -name 'atlas-lead-machine.log' 2>/dev/null | head
fi

echo ""
echo "=== HubSpot [CLIENT-ATLAS] created today ($TODAY UTC) ==="
python3 - "$AIPA" "$TODAY" <<'PY' || echo "HubSpot query failed"
import json, os, re, sys, urllib.request
from datetime import datetime, timezone

aipa, today = sys.argv[1], sys.argv[2]
env = open(os.path.join(aipa, ".env"), encoding="utf-8", errors="replace").read()
m = re.search(r"^HUBSPOT_API_KEY=(.+)$", env, re.M)
if not m:
    print("MISSING HUBSPOT_API_KEY")
    sys.exit(1)
key = m.group(1).strip()
start = datetime.strptime(today, "%Y-%m-%d").replace(tzinfo=timezone.utc)
start_ms = int(start.timestamp() * 1000)

def search(extra_filters, limit=20):
    body = {
        "filterGroups": [{"filters": extra_filters}],
        "properties": ["dealname", "createdate", "dealstage"],
        "sorts": [{"propertyName": "createdate", "direction": "DESCENDING"}],
        "limit": limit,
    }
    req = urllib.request.Request(
        "https://api.hubapi.com/crm/v3/objects/deals/search",
        data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.load(r)

today_filters = [
    {"propertyName": "dealname", "operator": "CONTAINS_TOKEN", "value": "CLIENT-ATLAS"},
    {"propertyName": "createdate", "operator": "GTE", "value": str(start_ms)},
]
j = search(today_filters)
results = j.get("results") or []
print(f"created_today={len(results)} total={j.get('total')}")
for row in results:
    p = row.get("properties") or {}
    name = (p.get("dealname") or "")[:90]
    print(f"  {p.get('createdate')}  {p.get('dealstage')}  {name}")

# Last two Mondays window (for Sep 7 miss)
sep7 = int(datetime(2026, 9, 7, tzinfo=timezone.utc).timestamp() * 1000)
week = search(
    [
        {"propertyName": "dealname", "operator": "CONTAINS_TOKEN", "value": "CLIENT-ATLAS"},
        {"propertyName": "createdate", "operator": "GTE", "value": str(sep7)},
    ],
    limit=20,
)
print(f"CLIENT-ATLAS since 2026-09-07 total={week.get('total')} showing={len(week.get('results') or [])}")
for row in (week.get("results") or [])[:20]:
    p = row.get("properties") or {}
    print(f"  {p.get('createdate')}  {(p.get('dealname') or '')[:90]}")
PY

echo ""
echo "=== concepts.json (lane picker + HubSpot note angle) ==="
CONCEPTS=/home/ubuntu/whitespace/data/concepts.json
if [[ -f "$CONCEPTS" ]]; then
  ls -l --time-style=long-iso "$CONCEPTS"
  python3 - "$CONCEPTS" <<'PY' || true
import json, sys
c = json.load(open(sys.argv[1], encoding="utf-8"))
lanes = ["whatsapp_ai_agents", "geo_aeo_tech_seo_makers", "ai_automation_solutions"]
print("keys", len(c) if isinstance(c, dict) else type(c))
if isinstance(c, dict):
    print("snapshot", c.get("snapshot_date") or c.get("generated_at") or list(c.keys())[:3])
    for lane in lanes:
        node = c.get(lane) or {}
        move = node.get("move") or {}
        print(f"  {lane} score={move.get('score')} state={move.get('state')} angle={((node.get('angle') or move.get('angle') or '')[:60])}")
PY
else
  echo "MISSING $CONCEPTS — pickLane falls back to geo_aeo_tech_seo_makers"
fi

echo ""
echo "=== git on this box (lead drafts) ==="
git -C "$AIPA" log -5 --format='%h %ci %s' -- docs/selling/outreach-registry.json 2>/dev/null || true
git -C "$AIPA" status -sb -- docs/selling/outreach-registry.json docs/selling/drafts 2>/dev/null | head

echo ""
echo "=== lead-machine-diagnose done ==="
