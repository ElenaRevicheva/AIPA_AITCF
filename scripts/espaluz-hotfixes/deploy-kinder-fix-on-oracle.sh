#!/bin/bash
# Apply EspaLuz WhatsApp kinder preference fix (checkout from GitHub main).
# Run on Oracle VM:
#   bash /home/ubuntu/cto-aipa/scripts/espaluz-hotfixes/deploy-kinder-fix-on-oracle.sh
set -euo pipefail

REPO_DIR="${ESPALUZ_WHATSAPP_DIR:-/home/ubuntu/EspaLuzWhatsApp}"

if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "EspaLuzWhatsApp repo not found at $REPO_DIR"
  exit 1
fi

cd "$REPO_DIR"

echo "=== Fetching latest EspaLuzWhatsApp main ==="
git fetch origin main

echo "=== Checkout fixed files ==="
git checkout origin/main -- espaluz_advanced_features.py scripts/tests/test_preference_parsing.py

echo "=== Regression test ==="
./venv/bin/python scripts/tests/test_preference_parsing.py

echo "=== Restarting espaluz-whatsapp ==="
sudo systemctl restart espaluz-whatsapp
sleep 2
curl -s -o /dev/null -w "webhook HTTP %{http_code}\n" --max-time 10 http://127.0.0.1:8081/webhook

echo "Done. Ask the bot about kinder schools — it should answer normally now."
