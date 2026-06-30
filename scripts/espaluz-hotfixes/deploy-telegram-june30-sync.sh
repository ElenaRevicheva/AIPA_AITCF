#!/bin/bash
# Sync Oracle Telegram to GitHub main (65ad940+) without touching runtime JSON.
# Use after drift: Oracle at old HEAD + local staged edits.
set -euo pipefail

TG_DIR="${ESPALUZ_FAMILYBOT_DIR:-/home/ubuntu/EspaLuzFamilybot}"
BRANCH="${BRANCH:-main}"
BACKUP="${BACKUP_DIR:-/tmp/tg-runtime-backup-$(date +%Y%m%d%H%M%S)}"

RUNTIME_JSON=(
  user_sessions.json
  user_trials.json
  user_onboarding.json
  telegram_subscribers.json
  telegram_phone_email_mapping.json
  discovered_subscription_ids.json
  espaluz_analytics.json
  paguelofacil_payments.json
  telegram_payment_reminders_sent.json
)

CODE_FILES=(
  .gitignore
  main.py
  espaluz_memory.py
  espaluz_paypal_system.py
  espaluz_paguelofacil.py
  paypal_webhook_server.py
  espaluz_database.py
  espaluz_menu.py
)

cd "$TG_DIR"
echo "=== Telegram June 30 sync ==="
echo "Dir: $TG_DIR"
echo "HEAD before: $(git rev-parse --short HEAD)"
echo "Backup: $BACKUP"
mkdir -p "$BACKUP"

for f in "${RUNTIME_JSON[@]}"; do
  if [[ -f "$f" ]]; then
    cp -a "$f" "$BACKUP/"
    echo "  backed up $f ($(stat -c%s "$f" 2>/dev/null || stat -f%z "$f") bytes)"
  fi
done

echo "=== git fetch origin/$BRANCH ==="
git fetch origin "$BRANCH"

echo "=== checkout code from origin/$BRANCH (not runtime JSON) ==="
# shellcheck disable=SC2086
git checkout "origin/$BRANCH" -- "${CODE_FILES[@]}"
git checkout "origin/$BRANCH" -- deploy/ docs/ 2>/dev/null || true

echo "=== restore runtime JSON from backup ==="
for f in "${RUNTIME_JSON[@]}"; do
  if [[ -f "$BACKUP/$f" ]]; then
    cp -a "$BACKUP/$f" "$f"
    echo "  restored $f"
  fi
done

echo "=== fast-forward HEAD to origin/$BRANCH ==="
git merge --ff-only "origin/$BRANCH"

echo "=== restart ==="
sudo systemctl restart espaluz-familybot espaluz-payments-webhook
sleep 2
systemctl is-active espaluz-familybot espaluz-payments-webhook

echo "=== verify ==="
grep -q get_session_uuid espaluz_memory.py && echo "OK  get_session_uuid in espaluz_memory.py"
echo "HEAD after: $(git rev-parse --short HEAD)"
echo "=== Done ==="
