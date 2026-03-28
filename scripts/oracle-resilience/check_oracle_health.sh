#!/bin/bash
# Oracle 170.9.242.90 — health check ALL 8 AI agents, restart if unhealthy.
# Deploy to server: /home/ubuntu/check_oracle_health.sh
# Cron: */5 * * * * /home/ubuntu/check_oracle_health.sh
# See: docs/ORACLE_ALL_PRODUCTS_RESILIENCE.md

LOG=/var/log/oracle-health.log
exec >> "$LOG" 2>&1

echo "=== $(date -Iseconds) ==="

# -----------------------------------------------------------------------------
# 7+8. Tech Co-Founder (CTO AIPA) + Creative Co-Founder Atuona — AIPA_AITCF, PM2
# -----------------------------------------------------------------------------
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1:3000/ 2>/dev/null || echo "000")
if [ "$HTTP" != "200" ]; then
  echo "CTO AIPA/Atuona (7+8) unhealthy (HTTP $HTTP), restarting PM2..."
  pm2 restart cto-aipa
fi

# -----------------------------------------------------------------------------
# 1. EspaLuz WhatsApp — systemd, port 8081
# -----------------------------------------------------------------------------
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://127.0.0.1:8081/webhook 2>/dev/null || echo "000")
if [ "$HTTP" != "200" ]; then
  echo "EspaLuz WhatsApp (1) unhealthy (HTTP $HTTP), restarting..."
  sudo systemctl restart espaluz-whatsapp
fi

# -----------------------------------------------------------------------------
# 2. EspaLuz Telegram — EspaLuzFamilybot, systemd
# -----------------------------------------------------------------------------
if ! systemctl is-active --quiet espaluz-familybot 2>/dev/null; then
  echo "EspaLuz Telegram (2) not active, restarting..."
  sudo systemctl restart espaluz-familybot
fi

# -----------------------------------------------------------------------------
# 3. EspaLuz Influencer — systemd
# -----------------------------------------------------------------------------
if ! systemctl is-active --quiet espaluz-influencer 2>/dev/null; then
  echo "EspaLuz Influencer (3) not active, restarting..."
  sudo systemctl restart espaluz-influencer
fi

# -----------------------------------------------------------------------------
# 4. Algom Alpha — dragontrade-agent, PM2 (main + dashboard + bybit + binance)
# -----------------------------------------------------------------------------
for app in dragontrade-main dragontrade-dashboard dragontrade-bybit dragontrade-binance; do
  if ! pm2 describe "$app" 2>/dev/null | grep -q "status: online"; then
    echo "Algom Alpha / $app (4) not online, restarting..."
    pm2 restart "$app"
  fi
done

# -----------------------------------------------------------------------------
# 5+6. VibeJob Hunter + AI Marketing Co-Founder — vibejobhunter-web (systemd)
# -----------------------------------------------------------------------------
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

# -----------------------------------------------------------------------------
# espaluz-webhook (if present — part of EspaLuz stack)
# -----------------------------------------------------------------------------
if systemctl list-unit-files espaluz-webhook.service 2>/dev/null | grep -q "espaluz-webhook.service"; then
  if ! systemctl is-active --quiet espaluz-webhook 2>/dev/null; then
    echo "espaluz-webhook not active, restarting..."
    sudo systemctl restart espaluz-webhook
  fi
fi

echo "Health check done."
