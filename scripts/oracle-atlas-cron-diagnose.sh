#!/usr/bin/env bash
echo "=== capture.log tail ==="
tail -40 /home/ubuntu/whitespace/data/capture.log 2>/dev/null || echo "no capture.log"
echo ""
echo "=== snapshot dates ==="
sqlite3 /home/ubuntu/whitespace/data/radar.sqlite "SELECT DISTINCT snapshot_date FROM angle_snapshots ORDER BY snapshot_date DESC LIMIT 10;"
echo ""
echo "=== counts by date ==="
sqlite3 /home/ubuntu/whitespace/data/radar.sqlite "SELECT snapshot_date, COUNT(*) FROM angle_snapshots GROUP BY snapshot_date ORDER BY snapshot_date DESC LIMIT 5;"
echo ""
echo "=== distinct days ==="
sqlite3 /home/ubuntu/whitespace/data/radar.sqlite "SELECT COUNT(DISTINCT snapshot_date) FROM angle_snapshots;"
echo ""
echo "=== api/atlas snapshot ==="
curl -s --max-time 30 http://127.0.0.1:8095/api/atlas | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log('snapshot_date:',j.snapshot_date,'distinct_days:',j.distinct_days,'total_rows:',j.total_rows,'pipeline:',JSON.stringify(j.pipeline||{}));});"
echo ""
echo "=== cron today (Panama date) ==="
TODAY=$(TZ=America/Panama date +%F)
grep "$TODAY" /home/ubuntu/whitespace/data/capture.log | head -3
grep "$TODAY" /home/ubuntu/whitespace/data/capture.log | tail -3
echo ""
echo "=== running pipeline ==="
pgrep -af 'dist/capture|dist/classify|dist/brief|dist/concept' || echo "none"
