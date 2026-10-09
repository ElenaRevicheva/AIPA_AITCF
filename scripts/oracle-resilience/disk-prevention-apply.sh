#!/bin/bash
# Oracle disk PREVENTION — re-runnable installer (9 Oct 2026). Run ON Oracle as ubuntu from a STAGING folder holding the repo's
# docs/oracle/health_monitor.sh + scripts/oracle-resilience/* (NOT ~/cto-aipa, which lags on purpose):
#   REPO=~/disk-prevention-2026-10-09 bash ~/disk-prevention-2026-10-09/scripts/oracle-resilience/disk-prevention-apply.sh
# Why: the 28 Sep 2026 fix lived only as prose (NOW.md + memory), so nobody could re-apply or compare it, and two parts of it
# silently did not work. Forensics: docs/oracle/ORACLE_DISK_FORENSICS_2026-10-09.md. Every step is idempotent.
#  1. disk alarm with a listener: health_monitor.sh -> Telegram at 85/90/95% (docs/oracle/health_monitor.sh)
#  2. health check watches the live payments webhook, not the dead duplicate (scripts/oracle-resilience/check_oracle_health.sh)
#  3. the duplicate espaluz-webhook.service (same paypal_webhook_server.py, can never bind :5000) disabled
#  4. pm2-logrotate COMPRESSION actually on: module 3.0.0 parseBool only accepts the string 'true', but its own pmx Autocast
#     hands it the boolean true -> patch parseBool to accept both (re-run after any `pm2 install pm2-logrotate`)
#  5. logrotate rule for the app logs nothing rotated (scripts/oracle-resilience/logrotate-aideazz-app-logs.conf)
#  6. journald cap 1G (the 28 Sep drop-in, re-asserted)
#  7. sysstat records filesystem usage (-S XDISK) so the next climb has a history (`sar -F`)
set -euo pipefail
REPO=${REPO:-/home/ubuntu/disk-prevention-2026-10-09}
say() { echo "[disk-prevention] $*"; }
# 9 Oct sync audit: Oracle ~/cto-aipa lags ON PURPOSE (named-file deploys), so its docs/oracle/health_monitor.sh is the OLD
# alarm without Telegram. Installing from a stale tree would silently undo the prevention — refuse instead.
grep -q "DISK ALERT DELIVERED" "$REPO/docs/oracle/health_monitor.sh" 2>/dev/null || {
  echo "[disk-prevention] REFUSED: $REPO/docs/oracle/health_monitor.sh is not the 9 Oct alarm (no Telegram). scp the repo files to a
  staging folder (e.g. ~/disk-prevention-2026-10-09/docs/oracle + scripts/oracle-resilience) and run with REPO=<that folder>."; exit 1; }

# 1 + 2: the two cron scripts (cron entries already exist: */5 for both)
install -m 755 "$REPO/docs/oracle/health_monitor.sh" /home/ubuntu/health_monitor.sh && say "health_monitor.sh installed"
install -m 755 "$REPO/scripts/oracle-resilience/check_oracle_health.sh" /home/ubuntu/check_oracle_health.sh && say "check_oracle_health.sh installed"

# 3: the duplicate webhook unit — only if the live payments unit holds :5000
if systemctl is-active --quiet espaluz-payments-webhook && sudo ss -ltnp | grep -q ':5000 '; then
  if systemctl is-enabled --quiet espaluz-webhook 2>/dev/null || systemctl is-active --quiet espaluz-webhook 2>/dev/null; then
    sudo systemctl disable --now espaluz-webhook && say "duplicate espaluz-webhook disabled (payments unit serves :5000)"
  else say "duplicate espaluz-webhook already disabled"; fi
else say "SKIP 3: espaluz-payments-webhook not active on :5000 — not touching espaluz-webhook"; fi

# 4: pm2-logrotate compression
F=/home/ubuntu/.pm2/modules/pm2-logrotate/node_modules/pm2-logrotate/app.js
if [ -f "$F" ]; then
  if grep -q "if (str === 'true') return true;" "$F"; then
    [ -e "$F.bak-pre-compress-fix" ] || cp "$F" "$F.bak-pre-compress-fix"
    sed -i "s/if (str === 'true') return true;/if (str === true || str === 'true') return true;/; s/if (str === 'false') return false;/if (str === false || str === 'false') return false;/" "$F"
    pm2 restart pm2-logrotate >/dev/null && say "pm2-logrotate parseBool patched + module restarted"
  else say "pm2-logrotate parseBool already patched"; fi
  pm2 set pm2-logrotate:compress true >/dev/null
else say "SKIP 4: pm2-logrotate not installed at $F"; fi

# 5: logrotate rule
sudo install -m 644 "$REPO/scripts/oracle-resilience/logrotate-aideazz-app-logs.conf" /etc/logrotate.d/aideazz-app-logs
sudo logrotate -d /etc/logrotate.d/aideazz-app-logs >/dev/null 2>&1 && say "logrotate rule installed (dry run OK)"

# 6: journald cap
if ! grep -qs '^SystemMaxUse=1G' /etc/systemd/journald.conf.d/99-aideazz-size.conf; then
  sudo mkdir -p /etc/systemd/journald.conf.d
  printf '[Journal]\nSystemMaxUse=1G\n' | sudo tee /etc/systemd/journald.conf.d/99-aideazz-size.conf >/dev/null
  sudo systemctl restart systemd-journald && say "journald cap 1G written"
else say "journald cap 1G already set"; fi

# 7: sysstat filesystem history
if grep -q '^SADC_OPTIONS="-S DISK"' /etc/sysstat/sysstat; then
  sudo sed -i 's/^SADC_OPTIONS="-S DISK"/SADC_OPTIONS="-S XDISK"/' /etc/sysstat/sysstat && say "sysstat now records filesystems (-S XDISK)"
else say "sysstat SADC_OPTIONS: $(grep '^SADC_OPTIONS' /etc/sysstat/sysstat)"; fi

say "done — df: $(df -h / | awk 'NR==2{print $5" used, "$4" free"}')"
