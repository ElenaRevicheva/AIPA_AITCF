#!/bin/bash
# Universal Oracle product deploy — phone + Cursor Cloud Agent entry point.
#
# Usage (on Oracle, via GitHub Actions):
#   PRODUCT=whatsapp DEPLOY_FILES="espaluz_bridge.py" bash scripts/oracle-resilience/deploy-product.sh
#   PRODUCT=cto_aipa bash scripts/oracle-resilience/deploy-product.sh
#   PRODUCT=telegram DEPLOY_FILES="main.py espaluz_memory.py" bash scripts/oracle-resilience/deploy-product.sh
#
# MEMORY-SAFE: checkout mode never touches runtime JSON (EspaLuz trials, user_sessions, etc.)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/oracle-products.conf"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/lib/fleet-deploy.sh"

PRODUCT="${PRODUCT:?Set PRODUCT=whatsapp|telegram|influencer|dragontrade|vjh|vjh_web|openclaw|cto_aipa|atlas}"
DEPLOY_FILES="${DEPLOY_FILES:-$(fleet_product_var "$PRODUCT" DEFAULT_FILES)}"
DISPATCH_NOTES="${DISPATCH_NOTES:-manual deploy}"

DIR="$(fleet_product_var "$PRODUCT" DIR)"
BRANCH="$(fleet_product_var "$PRODUCT" BRANCH)"
MODE="$(fleet_product_var "$PRODUCT" MODE)"
RESTART="$(fleet_product_var "$PRODUCT" RESTART)"
HEALTH="$(fleet_product_var "$PRODUCT" HEALTH)"
LABEL="$(fleet_product_var "$PRODUCT" LABEL)"
BUILD="$(fleet_product_var "$PRODUCT" BUILD)"

if [[ "$PRODUCT" == "cto_aipa" && ! -d "$DIR/.git" && -d "/home/ubuntu/AIPA_AITCF/.git" ]]; then
  DIR="/home/ubuntu/AIPA_AITCF"
fi

if [[ -z "$DIR" || ! -d "$DIR/.git" ]]; then
  echo "ERROR: Product $PRODUCT repo not found at $DIR"
  exit 1
fi

echo "=== Fleet deploy: $LABEL ==="
echo "=== Note: $DISPATCH_NOTES ==="
echo "=== Mode: $MODE | Dir: $DIR ==="

fleet_git_fetch "$DIR" "$BRANCH"

case "$MODE" in
  checkout)
    fleet_checkout_files "$BRANCH" "$DEPLOY_FILES"
    ;;
  pull_build|pull_build_pm2)
    # cto_aipa often has dirty Manual Prospect drafts/registry on the box
    # (staged locally then scp'd / half-synced). That blocks ff-only merge and
    # causes live /go/outreach-email 404s. .env stays (gitignored).
    if [[ "$PRODUCT" == "cto_aipa" ]]; then
      echo "=== cto_aipa: reset --hard origin/$BRANCH (fix dirty registry/drafts) ==="
      git reset --hard "origin/$BRANCH"
      git clean -fd -- docs/selling/drafts/ || true
    else
      fleet_pull_ff_only "$BRANCH"
    fi
    fleet_run_build "$BUILD"
    ;;
  *)
    echo "ERROR: Unknown MODE=$MODE for product $PRODUCT"
    exit 1
    ;;
esac

fleet_restart "$RESTART"

if [[ -n "$HEALTH" ]]; then
  fleet_health_one "$LABEL" "$HEALTH" || true
fi

echo "=== Done: $LABEL ==="
