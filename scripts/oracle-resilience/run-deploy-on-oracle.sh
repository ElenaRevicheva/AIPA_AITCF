#!/bin/bash
# Generic entrypoint for GitHub Actions SSH deploys.
# Usage on Oracle: bash scripts/oracle-resilience/run-deploy-on-oracle.sh <relative-script-under-scripts/>
set -euo pipefail

SCRIPT_REL="${1:?Usage: run-deploy-on-oracle.sh <path-under-scripts/> e.g. espaluz-hotfixes/deploy-kinder-fix-on-oracle.sh}"

AIPA_DIR="${AIPA_DIR:-/home/ubuntu/cto-aipa}"
if [[ ! -d "$AIPA_DIR/.git" ]]; then
  AIPA_DIR="/home/ubuntu/AIPA_AITCF"
fi
if [[ ! -d "$AIPA_DIR/.git" ]]; then
  echo "AIPA_AITCF checkout not found at /home/ubuntu/cto-aipa or /home/ubuntu/AIPA_AITCF"
  exit 1
fi

cd "$AIPA_DIR"
echo "=== Sync deploy scripts from origin/main ($AIPA_DIR) ==="
git fetch origin main
git checkout origin/main -- "scripts/${SCRIPT_REL%/*}/" 2>/dev/null || true
git checkout origin/main -- "scripts/$SCRIPT_REL"

TARGET="scripts/$SCRIPT_REL"
if [[ ! -f "$TARGET" ]]; then
  echo "Deploy script not found: $TARGET"
  exit 1
fi

echo "=== Running $TARGET ==="
bash "$TARGET"
