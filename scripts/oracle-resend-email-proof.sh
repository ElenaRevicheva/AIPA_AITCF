#!/usr/bin/env bash
# Read-only Resend proof on Oracle. Piped over SSH by the trigger workflow.
# Usage: bash scripts/oracle-resend-email-proof.sh <git-ref> <resend-uuid>
set -euo pipefail
REF="${1:-main}"
ID="${2:-d0721a1e-2eb2-48f0-b6b4-c15ce1743def}"
AIPA_DIR="${CTO_AIPA_ROOT:-/home/ubuntu/cto-aipa}"
OUT=/tmp/resend-email-proof.json

echo "--- resend-email-proof ref=$REF id=$ID dir=$AIPA_DIR ---"
cd "$AIPA_DIR"

# Do not git pull. Copy the script the workflow already scp'd, or use repo copy.
SCRIPT=/tmp/resend-email-proof.cjs
if [ ! -f "$SCRIPT" ]; then
  if [ -f "$AIPA_DIR/scripts/resend-email-proof.cjs" ]; then
    SCRIPT="$AIPA_DIR/scripts/resend-email-proof.cjs"
  else
    echo "resend-email-proof.cjs missing" >&2
    exit 1
  fi
fi

export CTO_AIPA_ROOT="$AIPA_DIR"
export RESEND_PROOF_OUT="$OUT"
node "$SCRIPT" "$ID"
echo "--- wrote $OUT ($(wc -c < "$OUT") bytes) ---"
head -c 4000 "$OUT"
echo
