#!/bin/bash
# Pull specific EspaLuzFamilybot files from GitHub main and restart.
# MEMORY-SAFE: code-only checkout — never touches user_sessions.json or PF JSON.
# Cloud agents: set DEPLOY_FILES (space-separated paths relative to repo root).
set -euo pipefail

REPO_DIR="${ESPALUZ_FAMILYBOT_DIR:-/home/ubuntu/EspaLuzFamilybot}"
FILES="${DEPLOY_FILES:-main.py espaluz_memory.py espaluz_rag.py}"

cd "$REPO_DIR"
echo "=== Fetch EspaLuzFamilybot main ==="
git fetch origin main
echo "=== Checkout (code only): $FILES ==="
# shellcheck disable=SC2086
git checkout origin/main -- $FILES

CTO="${CTO_AIPCF_DIR:-/home/ubuntu/cto-aipa}"
if [[ -f "$CTO/scripts/oracle-resilience/verify-espaluz-memory-persistence.sh" ]]; then
  bash "$CTO/scripts/oracle-resilience/verify-espaluz-memory-persistence.sh" || true
fi

echo "=== Restart espaluz-familybot ==="
sudo systemctl restart espaluz-familybot
sleep 2
sudo systemctl is-active espaluz-familybot
