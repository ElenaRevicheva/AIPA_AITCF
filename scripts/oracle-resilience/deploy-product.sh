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

PRODUCT="${PRODUCT:?Set PRODUCT=whatsapp|telegram|influencer|dragontrade|vjh|vjh_web|openclaw|cto_aipa|atuona|atlas}"
DEPLOY_FILES="${DEPLOY_FILES:-$(fleet_product_var "$PRODUCT" DEFAULT_FILES)}"
DISPATCH_NOTES="${DISPATCH_NOTES:-manual deploy}"

DIR="$(fleet_product_var "$PRODUCT" DIR)"
BRANCH="$(fleet_product_var "$PRODUCT" BRANCH)"
MODE="$(fleet_product_var "$PRODUCT" MODE)"
RESTART="$(fleet_product_var "$PRODUCT" RESTART)"
HEALTH="$(fleet_product_var "$PRODUCT" HEALTH)"
LABEL="$(fleet_product_var "$PRODUCT" LABEL)"
BUILD="$(fleet_product_var "$PRODUCT" BUILD)"

if [[ "$PRODUCT" == "cto_aipa" || "$PRODUCT" == "atuona" ]] && [[ ! -d "$DIR/.git" && -d "/home/ubuntu/AIPA_AITCF/.git" ]]; then
  DIR="/home/ubuntu/AIPA_AITCF"
fi

if [[ -z "$DIR" || ! -d "$DIR/.git" ]]; then
  echo "ERROR: Product $PRODUCT repo not found at $DIR"
  exit 1
fi

echo "=== Fleet deploy: $LABEL ==="
echo "=== Note: $DISPATCH_NOTES ==="
echo "=== Mode: $MODE | Dir: $DIR ==="

# One deployer at a time (NOW.md PART 1 §3). A restart <10 min ago means
# someone else is mid-deploy — do not stack another pm2 restart on top.
if [[ "$PRODUCT" == "atuona" || "$PRODUCT" == "cto_aipa" ]]; then
  UP_SECS="$(pm2 jlist 2>/dev/null | python3 -c "
import json, sys, time
try:
    apps = json.load(sys.stdin)
except Exception:
    print(99999)
    raise SystemExit
for a in apps:
    if a.get('name') == 'cto-aipa':
        up = a.get('pm2_env', {}).get('pm_uptime') or 0
        print(int(max(0, (time.time() * 1000 - float(up)) / 1000)))
        break
else:
    print(99999)
" 2>/dev/null || echo 99999)"
  echo "=== cto-aipa uptime: ${UP_SECS}s ==="
  if [[ "$UP_SECS" =~ ^[0-9]+$ ]] && (( UP_SECS < 600 )); then
    echo "REFUSE: cto-aipa restarted ${UP_SECS}s ago — another deploy is in flight"
    exit 1
  fi
fi

fleet_git_fetch "$DIR" "$BRANCH"

case "$MODE" in
  checkout)
    fleet_checkout_files "$BRANCH" "$DEPLOY_FILES"
    ;;
  checkout_build|checkout_build_pm2)
    # Named-file TypeScript deploy. Check out only the listed files, rebuild
    # dist/, restart. Does NOT git reset — Oracle's dirty checkout stays.
    fleet_checkout_files "$BRANCH" "$DEPLOY_FILES"
    fleet_run_build "$BUILD"
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
