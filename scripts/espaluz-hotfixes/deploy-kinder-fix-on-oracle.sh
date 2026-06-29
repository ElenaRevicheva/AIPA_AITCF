#!/bin/bash
# Apply EspaLuz WhatsApp fix: "kinder" no longer triggers preference handler.
# Run on Oracle VM as ubuntu:
#   bash /home/ubuntu/AIPA_AITCF/scripts/espaluz-hotfixes/deploy-kinder-fix-on-oracle.sh
set -euo pipefail

REPO_DIR="${ESPALUZ_WHATSAPP_DIR:-/home/ubuntu/EspaLuzWhatsApp}"
PATCH_FILE="$(cd "$(dirname "$0")" && pwd)/kinder-preference-fix.diff"

if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "EspaLuzWhatsApp repo not found at $REPO_DIR"
  exit 1
fi

cd "$REPO_DIR"

echo "=== Fetching latest EspaLuzWhatsApp main ==="
git fetch origin main

echo "=== Applying kinder preference fix patch ==="
if git apply --check "$PATCH_FILE" 2>/dev/null; then
  git apply "$PATCH_FILE"
else
  echo "Patch already applied or repo diverged — checking out fixed files from patch..."
  git apply --reject "$PATCH_FILE" || true
fi

echo "=== Regression test ==="
./venv/bin/python scripts/tests/test_preference_parsing.py

echo "=== Restarting espaluz-whatsapp ==="
sudo systemctl restart espaluz-whatsapp
sleep 2
curl -s -o /dev/null -w "webhook HTTP %{http_code}\n" --max-time 10 http://127.0.0.1:8081/webhook

echo "Done. Ask the bot about kinder schools — it should answer normally now."
