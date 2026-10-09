#!/bin/bash
# Health monitor - checks and logs system status. Deploy: /home/ubuntu/health_monitor.sh · cron: */5 * * * *
#
# 9 Oct 2026 — the disk alarm now has a LISTENER. Until today it wrote "WARNING: High disk usage" only into ~/health.log,
# which nobody reads: the disk went 69% (28 Sep) -> 100% (8 Oct) under ~500 unheard warnings and froze the bots' box
# (docs/oracle/ORACLE_DISK_FORENSICS_2026-10-09.md). Now it tells Elena on Telegram:
#   - once when the disk crosses 85 / 90 / 95 % on the way UP (state in ~/.disk_alert_level, so not every 5 minutes),
#   - again every 12 h while it stays at 95 %+,
#   - once when it is back below 80 %.
# Delivery is checked (Telegram must answer "ok":true) exactly like ~/bin/github-token-watch.sh; the level is stored only
# after a confirmed delivery, so a failed send is retried on the next run.

LOG_FILE=/home/ubuntu/health.log
ENV_FILE=/home/ubuntu/cto-aipa/.env
STATE=/home/ubuntu/.disk_alert_level
DATE=$(date '+%Y-%m-%d %H:%M:%S')

# Check memory
MEM_FREE=$(free -m | awk '/Mem:/ {print $4}')
MEM_PERCENT=$(free | awk '/Mem:/ {printf "%.0f", $3/$2*100}')

# Check disk
DISK_PERCENT=$(df / | awk 'NR==2 {gsub(/%/,""); print $5}')
DISK_FREE=$(df -h / | awk 'NR==2 {print $4}')

# Log status
echo "$DATE | MEM: ${MEM_PERCENT}% used (${MEM_FREE}MB free) | DISK: ${DISK_PERCENT}% used" >> $LOG_FILE

# Alert if memory > 85%
if [ $MEM_PERCENT -gt 85 ]; then
    echo "$DATE | WARNING: High memory usage: ${MEM_PERCENT}%" >> $LOG_FILE
fi

# Alert if disk > 80%
if [ $DISK_PERCENT -gt 80 ]; then
    echo "$DATE | WARNING: High disk usage: ${DISK_PERCENT}%" >> $LOG_FILE
fi

# ---- Telegram: the alarm must reach a person -------------------------------------------------------------------------
tg() {
  local msg="$1" bot chat resp
  bot=$(grep -m1 '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '\r"')
  chat=$(grep -m1 '^TELEGRAM_LEADS_DIGEST_CHAT_ID=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '\r"')
  if [ -z "$bot" ] || [ -z "$chat" ]; then
    echo "$DATE | DISK ALERT NOT DELIVERED (no telegram config in $ENV_FILE)" >> $LOG_FILE; return 1
  fi
  resp=$(curl -s --max-time 20 -X POST "https://api.telegram.org/bot${bot}/sendMessage" \
    -d chat_id="${chat}" -d parse_mode=HTML --data-urlencode text="$msg")
  if printf '%s' "$resp" | grep -q '"ok":true'; then
    echo "$DATE | DISK ALERT DELIVERED: ${msg:0:80}" >> $LOG_FILE; return 0
  fi
  echo "$DATE | DISK ALERT NOT DELIVERED: $(printf '%s' "$resp" | head -c 200)" >> $LOG_FILE; return 1
}

LEVEL=0
[ "$DISK_PERCENT" -ge 85 ] && LEVEL=85
[ "$DISK_PERCENT" -ge 90 ] && LEVEL=90
[ "$DISK_PERCENT" -ge 95 ] && LEVEL=95
read -r PREV LAST_AT 2>/dev/null < "$STATE"
PREV=${PREV:-0}; LAST_AT=${LAST_AT:-0}
NOW=$(date +%s)
HOW="Biggest usual causes: film/promo working folders (~/aigo-*, ~/atuona-film*), /tmp scratch, old logs. Never render video on Oracle. Runbook: docs/oracle/ORACLE_DISK_FORENSICS_2026-10-09.md"

if [ "$LEVEL" -gt "$PREV" ]; then
  tg "⚠️ <b>Oracle disk ${DISK_PERCENT}% full</b> (${DISK_FREE} free) — crossed ${LEVEL}%. Your bots share this disk; at 100% they fail to save data. ${HOW}" \
    && echo "$LEVEL $NOW" > "$STATE"
elif [ "$LEVEL" -ge 95 ] && [ $((NOW - LAST_AT)) -ge 43200 ]; then
  tg "⚠️ <b>Oracle disk still ${DISK_PERCENT}% full</b> (${DISK_FREE} free) — 12 h reminder. ${HOW}" \
    && echo "$LEVEL $NOW" > "$STATE"
elif [ "$DISK_PERCENT" -lt 80 ] && [ "$PREV" -gt 0 ]; then
  tg "✅ Oracle disk back to ${DISK_PERCENT}% (${DISK_FREE} free)." && echo "0 $NOW" > "$STATE"
elif [ "$LEVEL" -lt "$PREV" ] && [ "$LEVEL" -gt 0 ]; then
  echo "$LEVEL $LAST_AT" > "$STATE"   # went down a band but not below 80%: re-arm the higher bands quietly
fi

# Keep only last 1000 lines
tail -1000 $LOG_FILE > $LOG_FILE.tmp && mv $LOG_FILE.tmp $LOG_FILE
