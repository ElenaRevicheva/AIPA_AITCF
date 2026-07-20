#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/cto-aipa
test -f .env
grep -q "^HUBSPOT_API_KEY=" .env
mkdir -p /home/ubuntu/bin /home/ubuntu/logs docs/selling
cat > /home/ubuntu/bin/hs-watch-manual-emails.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/cto-aipa
exec /usr/bin/node scripts/hs-watch-manual-emails.cjs --hours=24 >> /home/ubuntu/logs/hs-watch-manual-emails.log 2>&1
EOF
chmod +x /home/ubuntu/bin/hs-watch-manual-emails.sh
CRON_LINE="*/10 * * * * /home/ubuntu/bin/hs-watch-manual-emails.sh"
( crontab -l 2>/dev/null | grep -v hs-watch-manual-emails || true; echo "$CRON_LINE" ) | crontab -
echo "=== crontab ==="
crontab -l | grep hs-watch
echo "=== smoke ==="
/home/ubuntu/bin/hs-watch-manual-emails.sh
tail -30 /home/ubuntu/logs/hs-watch-manual-emails.log
