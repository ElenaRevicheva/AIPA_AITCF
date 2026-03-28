#!/bin/bash
# Run this script ON the Oracle server (170.9.242.90) as ubuntu.
# It installs health-check + keep-alive scripts, crontab, systemd drop-ins, and PM2 startup.
# One-time setup so agents never silently die.
set -e

echo "=== Oracle resilience one-time setup ==="

# --- 1. Health-check script (ALL 8 agents) ---
cat > /home/ubuntu/check_oracle_health.sh << 'HEALTH_SCRIPT'
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
for app in dragontrade-main dragontrade-dashboard dragontrade-bybit dragontrade-binance; do
  if ! pm2 describe "$app" 2>/dev/null | grep -q "status: online"; then
    echo "Algom Alpha / $app (4) not online, restarting..."
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
HEALTH_SCRIPT

chmod +x /home/ubuntu/check_oracle_health.sh
echo "  [OK] /home/ubuntu/check_oracle_health.sh"

# --- 2. Keep-alive script ---
cat > /home/ubuntu/oci_keepalive.sh << 'KEEPALIVE_SCRIPT'
#!/bin/bash
# Prevent Oracle from reclaiming free-tier instance.
LOG=/var/log/oci-keepalive.log
dd if=/dev/urandom bs=1M count=10 of=/dev/null 2>/dev/null
curl -s -o /dev/null --max-time 5 http://127.0.0.1:3000/ || true
curl -s -o /dev/null --max-time 5 http://127.0.0.1:8081/webhook || true
curl -s -o /dev/null --max-time 5 http://127.0.0.1:3001/ || true
echo "$(date -Iseconds): keepalive" >> "$LOG"
KEEPALIVE_SCRIPT

chmod +x /home/ubuntu/oci_keepalive.sh
echo "  [OK] /home/ubuntu/oci_keepalive.sh"

# --- 3. Log files (cron runs as ubuntu) ---
sudo touch /var/log/oracle-health.log /var/log/oci-keepalive.log
sudo chown ubuntu:ubuntu /var/log/oracle-health.log /var/log/oci-keepalive.log
echo "  [OK] Log files in /var/log/"

# --- 4. Crontab (append if not already present) ---
CRON_MARKER="# oracle-resilience"
if ! crontab -l 2>/dev/null | grep -q "check_oracle_health.sh"; then
  (crontab -l 2>/dev/null; echo "$CRON_MARKER"; echo "*/5 * * * * /home/ubuntu/check_oracle_health.sh"; echo "0 */4 * * * /home/ubuntu/oci_keepalive.sh") | crontab -
  echo "  [OK] Crontab added (health every 5 min, keepalive every 4 h)"
else
  echo "  [OK] Crontab already has resilience entries"
fi

# --- 5. Systemd drop-ins (restart hardening, no WatchdogSec) ---
RESILIENCE_CONF="[Service]
Restart=always
RestartSec=10
StartLimitIntervalSec=300
StartLimitBurst=10
"

for unit in espaluz-whatsapp espaluz-influencer espaluz-familybot espaluz-webhook vibejobhunter-web vibejobhunter; do
  if systemctl list-unit-files --full "${unit}.service" 2>/dev/null | grep -q "${unit}.service"; then
    DROPDIR="/etc/systemd/system/${unit}.service.d"
    sudo mkdir -p "$DROPDIR"
    echo "$RESILIENCE_CONF" | sudo tee "$DROPDIR/resilience.conf" > /dev/null
    sudo systemctl daemon-reload
    sudo systemctl enable "${unit}.service"
    sudo systemctl restart "${unit}.service"
    echo "  [OK] systemd: $unit (drop-in + enabled + restarted)"
  else
    echo "  [--] systemd: $unit not installed (skip)"
  fi
done

# --- 6. PM2 startup on boot ---
echo ""
echo "--- PM2 startup on boot ---"
echo "Run the command that pm2 startup prints below, then run: pm2 save"
echo ""
pm2 startup || true

echo ""
echo "=== Done. Next steps (if any): ==="
echo "  1. Run the 'pm2 startup' command printed above (sudo env ...)."
echo "  2. Run: pm2 save"
echo "  3. In 5 min check: tail -30 /var/log/oracle-health.log"
echo "Agents will auto-restart on crash/hang and keep-alive will reduce Oracle reclamation."
echo ""
