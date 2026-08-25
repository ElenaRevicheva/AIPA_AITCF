#!/usr/bin/env bash
# Run the IntelliOps HubSpot staging script on Oracle, where .env and egress exist.
#
# A Cursor cloud agent cannot reach api.hubapi.com. This script is piped to the box
# over ssh by .github/workflows/hs-note-intelliops-on-trigger.yml.
#
# Usage (on Oracle): bash oracle-hs-note-intelliops.sh <git-ref>
set -uo pipefail

REF="${1:?ref required}"

AIPA_DIR=/home/ubuntu/cto-aipa
[ -d "$AIPA_DIR/.git" ] || AIPA_DIR=/home/ubuntu/AIPA_AITCF
cd "$AIPA_DIR" || { echo "FATAL: no cto-aipa checkout on this box"; exit 1; }
echo "--- IntelliOps HubSpot note in $AIPA_DIR as $(whoami) ref=$REF ---"

if [ ! -f .env ]; then
  echo "FATAL: .env missing on Oracle — HUBSPOT_API_KEY unavailable"
  exit 1
fi

echo "--- fetching $REF ---"
git fetch origin "$REF" 2>&1 || { echo "FATAL: fetch $REF failed"; exit 1; }
git checkout FETCH_HEAD -- \
  scripts/hs-note-intelliops-eval.cjs \
  scripts/hs-env.cjs \
  docs/selling/drafts/intelliops-reply-2026-08-25.txt \
  docs/selling/_intelliops_hs_report.json \
  2>&1 || { echo "FATAL: checkout of IntelliOps files failed"; exit 1; }

echo "--- node scripts/hs-note-intelliops-eval.cjs ---"
set +e
node scripts/hs-note-intelliops-eval.cjs 2>&1
RC=$?
set -e
echo "--- hs-note-intelliops-eval exit code: $RC ---"

if [ -f docs/selling/_intelliops_hs_report.json ]; then
  cp docs/selling/_intelliops_hs_report.json /tmp/intelliops-hs-report.json
  echo "--- copied report to /tmp/intelliops-hs-report.json ---"
  cat /tmp/intelliops-hs-report.json
else
  echo "WARN: no report file written"
fi

exit $RC
