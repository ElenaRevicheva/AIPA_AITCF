#!/usr/bin/env bash
# On Oracle: search Zoho IMAP for AfterQuery, then stage HubSpot + registry.
# Piped over ssh by .github/workflows/stage-hiring-on-trigger.yml
set -uo pipefail

REF="${1:?ref required}"
AIPA_DIR=/home/ubuntu/cto-aipa
[ -d "$AIPA_DIR/.git" ] || AIPA_DIR=/home/ubuntu/AIPA_AITCF
cd "$AIPA_DIR" || { echo "FATAL: no cto-aipa checkout"; exit 1; }
echo "--- afterquery re-ask in $AIPA_DIR as $(whoami) ref=$REF ---"

if [ ! -f .env ]; then
  echo "FATAL: .env missing on Oracle"
  exit 1
fi

echo "--- fetching $REF ---"
git fetch origin "$REF" 2>&1 || { echo "FATAL: fetch $REF failed"; exit 1; }
git checkout FETCH_HEAD -- scripts/zoho-search-afterquery.py scripts/stage-afterquery-reask.cjs 2>&1 \
  || echo "WARN: could not checkout scripts from $REF — using copy on box"

snapshot() { find docs/selling -type f -exec md5sum {} + 2>/dev/null | sort; }
BEFORE=$(mktemp)
snapshot > "$BEFORE"

echo "--- Zoho IMAP search ---"
python3 scripts/zoho-search-afterquery.py
SEARCH_RC=$?
echo "--- zoho search exit $SEARCH_RC ---"
if [ -f /tmp/afterquery-zoho.json ]; then
  python3 - <<'PY'
import json
p="/tmp/afterquery-zoho.json"
d=json.load(open(p))
print("ok", d.get("ok"), "inbound", d.get("inbound_count"), "outbound", d.get("outbound_count"))
print("reply_from", d.get("reply_from") or "-")
print("reply_subject", (d.get("reply_subject") or "-")[:120])
print("error", d.get("error") or "-")
print("folders", ",".join(d.get("folders_tried") or []))
PY
fi

echo "--- stage HubSpot ---"
set +e
node scripts/stage-afterquery-reask.cjs
STAGE_RC=$?
set -e
echo "--- stage exit $STAGE_RC ---"

AFTER=$(mktemp)
snapshot > "$AFTER"
CHANGED=$(mktemp)
comm -13 "$BEFORE" "$AFTER" | sed 's/^[0-9a-f]*  //' | sort -u > "$CHANGED"
if [ -f /tmp/afterquery-zoho.json ]; then
  echo "/tmp/afterquery-zoho.json" >> "$CHANGED"
fi

OUT=/tmp/afterquery-reask-output.tar.gz
rm -f "$OUT"
if [ -s "$CHANGED" ]; then
  echo "--- packing ---"
  sed 's/^/      /' "$CHANGED"
  tar -czf "$OUT" -T "$CHANGED" 2>/dev/null && echo "--- packed → $OUT ---"
else
  echo "--- nothing to pack ---"
fi
rm -f "$BEFORE" "$AFTER" "$CHANGED"

# Search miss is not fatal if we still staged the fallback letter.
if [ "$STAGE_RC" -ne 0 ]; then
  exit "$STAGE_RC"
fi
exit 0
