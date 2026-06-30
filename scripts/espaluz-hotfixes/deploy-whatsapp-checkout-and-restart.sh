#!/bin/bash
# Pull specific EspaLuzWhatsApp files from GitHub main and restart.
# MEMORY-SAFE: only checks out named code files — never touches JSON/DB data dirs.
# Cloud agents: set DEPLOY_FILES env (space-separated paths relative to repo root).
set -euo pipefail

REPO_DIR="${ESPALUZ_WHATSAPP_DIR:-/home/ubuntu/EspaLuzWhatsApp}"
FILES="${DEPLOY_FILES:-espaluz_advanced_features.py}"

cd "$REPO_DIR"
echo "=== Fetch EspaLuzWhatsApp main ==="
git fetch origin main
echo "=== Checkout (code only): $FILES ==="
# shellcheck disable=SC2086
git checkout origin/main -- $FILES

if [[ -f scripts/oracle-resilience/verify-espaluz-memory-persistence.sh ]]; then
  bash scripts/oracle-resilience/verify-espaluz-memory-persistence.sh || true
elif [[ -f /home/ubuntu/cto-aipa/scripts/oracle-resilience/verify-espaluz-memory-persistence.sh ]]; then
  bash /home/ubuntu/cto-aipa/scripts/oracle-resilience/verify-espaluz-memory-persistence.sh || true
fi

if [[ -f scripts/tests/test_preference_parsing.py ]]; then
  echo "=== Optional regression test ==="
  ./venv/bin/python scripts/tests/test_preference_parsing.py || true
fi

echo "=== Restart espaluz-whatsapp ==="
sudo systemctl restart espaluz-whatsapp
sleep 2
sudo systemctl is-active espaluz-whatsapp
curl -s -o /dev/null -w "webhook HTTP %{http_code}\n" --max-time 10 http://127.0.0.1:8081/webhook
