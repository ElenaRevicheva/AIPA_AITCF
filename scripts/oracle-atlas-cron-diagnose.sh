#!/usr/bin/env bash
# Read-only dump of the Atlas Monday pipeline on Oracle.
# Product lives at /home/ubuntu/whitespace (atlas-shifted). Do not restart PM2.
# Invoked by .deploy-trigger product `atlas-diagnose`.
set -uo pipefail
WS=/home/ubuntu/whitespace
LOG=$WS/data/capture.log
JSONL=$WS/data/captures.jsonl
SQLITE=$WS/data/radar.sqlite
TODAY=$(TZ=America/Panama date +%F)

echo "=== host ==="
date -u +%FT%TZ
echo "Panama date: $TODAY"
echo "node: $(node -v 2>/dev/null || echo missing)"
echo "pm2 whitespace:"
pm2 describe whitespace 2>/dev/null | grep -E 'status|uptime|restarts|script path' || echo "pm2 describe failed"

echo ""
echo "=== crontab (atlas) ==="
crontab -l 2>/dev/null | grep -E 'atlas|whitespace|classify' || echo "(no atlas cron lines)"

echo ""
echo "=== whitespace git (pointer only; box is meant to lag) ==="
if [[ -d "$WS/.git" ]]; then
  git -C "$WS" rev-parse --short HEAD
  git -C "$WS" log -1 --format='%ci %s'
  git -C "$WS" status -sb | head -5
else
  echo "no git at $WS"
fi

echo ""
echo "=== data files ==="
ls -lh "$LOG" "$JSONL" "$SQLITE" 2>/dev/null || echo "missing data files"
echo -n "captures.jsonl lines: "
wc -l < "$JSONL" 2>/dev/null || echo "n/a"

echo ""
echo "=== snapshot dates (sqlite) ==="
if [[ -f "$SQLITE" ]]; then
  sqlite3 "$SQLITE" "SELECT DISTINCT snapshot_date FROM angle_snapshots ORDER BY snapshot_date DESC LIMIT 10;"
  echo "--- counts by date ---"
  sqlite3 "$SQLITE" "SELECT snapshot_date, COUNT(*) FROM angle_snapshots GROUP BY snapshot_date ORDER BY snapshot_date DESC LIMIT 5;"
  echo "--- distinct days ---"
  sqlite3 "$SQLITE" "SELECT COUNT(DISTINCT snapshot_date) FROM angle_snapshots;"
else
  echo "no radar.sqlite"
fi

echo ""
echo "=== /api/atlas snapshot ==="
curl -s --max-time 30 http://127.0.0.1:8095/api/atlas | node -e "
let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
  try {
    const j=JSON.parse(d);
    console.log('snapshot_date:', j.snapshot_date, 'distinct_days:', j.distinct_days, 'total_rows:', j.total_rows, 'pipeline:', JSON.stringify(j.pipeline||{}));
  } catch (e) {
    console.log('api parse failed:', String(e).slice(0,120), 'body:', d.slice(0,200));
  }
});
" || echo "api/atlas unreachable"

echo ""
echo "=== running pipeline ==="
pgrep -af 'dist/capture|dist/classify|dist/brief|dist/concept' || echo "none"

echo ""
echo "=== capture.log error/result slice (last 80 matching) ==="
if [[ -f "$LOG" ]]; then
  grep -n -E 'CLASSIFY|embeddings|Error|ALERT:|FAILED|no captures|ATLAS CAPTURE|ATLAS CLASSIFY|OpenAI|insufficient_quota|429|sqlite' "$LOG" | tail -80
else
  echo "no capture.log"
fi

echo ""
echo "=== capture.log last 120 lines ==="
tail -120 "$LOG" 2>/dev/null || echo "no capture.log"

echo ""
echo "=== Panama $TODAY lines (head 5 / tail 10) ==="
if [[ -f "$LOG" ]]; then
  grep "$TODAY" "$LOG" | head -5
  echo "---"
  grep "$TODAY" "$LOG" | tail -10
else
  echo "no capture.log"
fi

echo ""
echo "=== diagnose done ==="
