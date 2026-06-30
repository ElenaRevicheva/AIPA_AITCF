#!/bin/bash
# Read-only health check for ALL Oracle fleet products (#1-11 except AILA #10, Sprinter AWS #8.1).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/oracle-products.conf"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/lib/fleet-deploy.sh"

echo "=== Oracle fleet health — $(date -Iseconds) ==="
FAIL=0

for product in $FLEET_ORACLE_PRODUCTS; do
  LABEL="$(fleet_product_var "$product" LABEL)"
  HEALTH="$(fleet_product_var "$product" HEALTH)"
  if [[ -z "$HEALTH" ]]; then
    echo "SKIP $LABEL (no health cmd)"
    continue
  fi
  fleet_health_one "$LABEL" "$HEALTH" || FAIL=$((FAIL + 1))
done

# EspaLuz memory layers (read-only)
if [[ -f "$SCRIPT_DIR/verify-espaluz-memory-persistence.sh" ]]; then
  echo
  bash "$SCRIPT_DIR/verify-espaluz-memory-persistence.sh" || true
fi

echo
if [[ "$FAIL" -gt 0 ]]; then
  echo "=== $FAIL product(s) reported unhealthy ==="
  exit 1
fi
echo "=== All fleet health checks passed ==="
