#!/bin/bash
# Run ON Oracle server once: append HASHNODE_DAILY_* if missing, print trigger secret.
set -e
cd /home/ubuntu/cto-aipa
if grep -q "^HASHNODE_DAILY_ENABLED=" .env 2>/dev/null; then
  echo "HASHNODE_DAILY_* already in .env - skipping append"
  exit 0
fi
SECRET=$(openssl rand -hex 16)
{
  echo ""
  echo "# Hashnode daily (deploy 2026-04-09)"
  echo "HASHNODE_DAILY_ENABLED=true"
  echo "HASHNODE_DAILY_PUBLIC=true"
  echo "HASHNODE_DAILY_CRON=30 9 * * *"
  echo "HASHNODE_DAILY_TZ=America/Panama"
  echo "HASHNODE_DAILY_TRIGGER_SECRET=${SECRET}"
} >> .env
echo "OK - appended. Save this trigger secret for manual POST /hashnode/daily-run:"
echo "${SECRET}"
