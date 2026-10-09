#!/bin/bash
# Oracle 170.9.242.90 — health check ALL 8 AI agents.
LOG=/var/log/oracle-health.log
exec >> "$LOG" 2>&1

echo "=== $(date -Iseconds) ==="

# 7+8. CTO AIPA + Atuona (PM2, 3000)
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1:3000/ 2>/dev/null || echo "000")
if [ "$HTTP" != "200" ]; then
  echo "CTO AIPA/Atuona (7+8) unhealthy (HTTP $HTTP), restarting..."
  pm2 restart cto-aipa
fi

# 1. EspaLuz WhatsApp (systemd, 8081)
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1:8081/webhook 2>/dev/null || echo "000")
if [ "$HTTP" != "200" ]; then
  echo "EspaLuz WhatsApp (1) unhealthy (HTTP $HTTP), restarting..."
  sudo systemctl restart espaluz-whatsapp
fi

# 2. EspaLuz Telegram (espaluz-familybot)
if ! systemctl is-active --quiet espaluz-familybot 2>/dev/null; then
  echo "EspaLuz Telegram (2) not active, restarting..."
  sudo systemctl restart espaluz-familybot
fi

# 3. EspaLuz Influencer
if ! systemctl is-active --quiet espaluz-influencer 2>/dev/null; then
  echo "EspaLuz Influencer (3) not active, restarting..."
  sudo systemctl restart espaluz-influencer
fi

# 4. Algom Alpha (dragontrade PM2 apps)
# May 25 2026 FIX: use jq on pm2 jlist. The previous grep "status: online"
# NEVER matched because pm2 describe uses box-drawing chars (vertical bars,
# no colon). That bug caused every dragontrade-* app to be wrongly restarted
# every 5 min for weeks (silent 5-min crashloop). Now we parse the real
# status field from JSON and only restart when truly not 'online'.
for app in dragontrade-main dragontrade-dashboard; do
  status=$(pm2 jlist 2>/dev/null | jq -r --arg app "$app" '.[] | select(.name==$app) | .pm2_env.status' 2>/dev/null)
  if [ -z "$status" ]; then
    echo "Algom Alpha / $app (4) MISSING from pm2 list, skipping (deleted or never started)"
  elif [ "$status" != "online" ]; then
    echo "Algom Alpha / $app (4) status=$status, restarting..."
    pm2 restart "$app"
  fi
done

# 5+6. VibeJob + CMO (vibejobhunter-web, vibejobhunter)
if ! systemctl is-active --quiet vibejobhunter-web 2>/dev/null; then
  echo "VibeJob/CMO (5+6) vibejobhunter-web not active, restarting..."
  sudo systemctl restart vibejobhunter-web
fi
if systemctl list-unit-files vibejobhunter.service 2>/dev/null | grep -q "vibejobhunter.service"; then
  if ! systemctl is-active --quiet vibejobhunter 2>/dev/null; then
    echo "VibeJob/CMO (5+6) vibejobhunter not active, restarting..."
    sudo systemctl restart vibejobhunter
  fi
fi

# espaluz-webhook (EspaLuz stack)
if systemctl list-unit-files espaluz-webhook.service 2>/dev/null | grep -q "espaluz-webhook.service"; then
  if ! systemctl is-active --quiet espaluz-webhook 2>/dev/null; then
    echo "espaluz-webhook not active, restarting..."
    sudo systemctl restart espaluz-webhook
  fi
fi

echo "Health check done."
