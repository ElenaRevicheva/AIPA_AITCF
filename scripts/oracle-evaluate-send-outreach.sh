#!/usr/bin/env bash
# Evaluate [CLIENT*] deals and auto-send first / FU email via /go/outreach-email/{slug}/send.
#
# Usage (on Oracle, or via evaluate-send-outreach-on-trigger.yml):
#   bash scripts/oracle-evaluate-send-outreach.sh <ref> [--dry-run|--send] [extra flags]
#
# Example:
#   bash scripts/oracle-evaluate-send-outreach.sh cursor/foo-cf91 --dry-run
#   bash scripts/oracle-evaluate-send-outreach.sh main --send --only=kennedy-home,t-mapp
set -uo pipefail

REF="${1:?git ref required}"
shift
MODE="${1:-}"
shift || true
EXTRA=("$@")

AIPA_DIR=/home/ubuntu/cto-aipa
[ -d "$AIPA_DIR/.git" ] || AIPA_DIR=/home/ubuntu/AIPA_AITCF
cd "$AIPA_DIR" || { echo "FATAL: no cto-aipa checkout"; exit 1; }

if [ ! -f .env ]; then
  echo "FATAL: .env missing on Oracle"
  exit 1
fi

case "$MODE" in
  --dry-run|--send) ;;
  *)
    echo "FATAL: pass --dry-run or --send"
    exit 1
    ;;
esac

echo "--- evaluate-send in $AIPA_DIR as $(whoami) ref=$REF mode=$MODE ---"
git fetch origin "$REF" 2>&1 || { echo "FATAL: fetch failed"; exit 1; }
git checkout FETCH_HEAD -- scripts/hs-evaluate-and-send-outreach.cjs scripts/hs-env.cjs 2>&1 \
  || echo "WARN: script checkout partial — using box copy"

echo "--- sync outreach registry + drafts from $REF ---"
git checkout FETCH_HEAD -- docs/selling/outreach-registry.json docs/selling/drafts/ 2>&1 \
  || echo "WARN: registry/drafts checkout failed"

echo "--- pm2 go-wa warm ---"
pm2 describe cto-aipa >/dev/null 2>&1 && pm2 restart cto-aipa --update-env && sleep 2 || true

OUT=/tmp/evaluate-send-output.json
set +e
node scripts/hs-evaluate-and-send-outreach.cjs "$MODE" "${EXTRA[@]}" 2>&1 | tee /tmp/evaluate-send.log
RC=${PIPESTATUS[0]}
set -e

if [ "$MODE" = "--send" ] && [ "$RC" -eq 0 ]; then
  echo "--- resend-reconcile (ENTREGADO stamps) ---"
  node scripts/resend-reconcile.cjs --days=1 2>&1 || true
  sleep 5
  echo "--- prove automation (pm2 log cross-check) ---"
  node scripts/_prove-automation-fired.cjs 2>&1 | tail -20 || true
fi

cp -f docs/selling/_evaluate_send_report.json "$OUT" 2>/dev/null || true
echo "--- report: $OUT ---"
[ -f "$OUT" ] && head -c 4000 "$OUT" || cat /tmp/evaluate-send.log | tail -40

exit "$RC"
