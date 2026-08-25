#!/usr/bin/env bash
# Run IntelliOps HubSpot jobs on Oracle (HubSpot + Zoho IMAP live here).
#
# Usage (on Oracle): bash oracle-hs-note-intelliops.sh <git-ref> [intelliops-eval|intelliops-story]
set -uo pipefail

REF="${1:?ref required}"
CMD="${2:-intelliops-eval}"

AIPA_DIR=/home/ubuntu/cto-aipa
[ -d "$AIPA_DIR/.git" ] || AIPA_DIR=/home/ubuntu/AIPA_AITCF
cd "$AIPA_DIR" || { echo "FATAL: no cto-aipa checkout on this box"; exit 1; }
echo "--- IntelliOps $CMD in $AIPA_DIR as $(whoami) ref=$REF ---"

if [ ! -f .env ]; then
  echo "FATAL: .env missing on Oracle — credentials unavailable"
  exit 1
fi

echo "--- fetching $REF ---"
git fetch origin "$REF" 2>&1 || { echo "FATAL: fetch $REF failed"; exit 1; }
  git checkout FETCH_HEAD -- \
  scripts/hs-note-intelliops-eval.cjs \
  scripts/hs-intelliops-story.cjs \
  scripts/intelliops-imap-pull.py \
  scripts/hs-env.cjs \
  scripts/wa-link-lib.cjs \
  docs/selling/drafts/intelliops-reply-2026-08-25.txt \
  docs/selling/drafts/intelliops-bd-email.txt \
  docs/selling/_intelliops_hs_report.json \
  2>&1 || { echo "FATAL: checkout of IntelliOps files failed"; exit 1; }

RC=0
if [ "$CMD" = "intelliops-story" ]; then
  echo "--- python3 -u scripts/intelliops-imap-pull.py ---"
  set +e
  python3 -u scripts/intelliops-imap-pull.py 2>&1
  echo "--- imap exit $? ---"
  echo "--- node scripts/hs-intelliops-story.cjs ---"
  node scripts/hs-intelliops-story.cjs 2>&1
  RC=$?
  set -e
  echo "--- story exit code: $RC ---"
else
  echo "--- node scripts/hs-note-intelliops-eval.cjs ---"
  set +e
  node scripts/hs-note-intelliops-eval.cjs 2>&1
  RC=$?
  set -e
  echo "--- hs-note-intelliops-eval exit code: $RC ---"
fi

mkdir -p /tmp
if [ -f docs/selling/_intelliops_hs_report.json ]; then
  cp docs/selling/_intelliops_hs_report.json /tmp/intelliops-hs-report.json
  echo "--- copied report ---"
  cat /tmp/intelliops-hs-report.json
fi

# Pack selling artifacts this run wrote (not the whole dirty docs/selling tree).
PACK=/tmp/intelliops-story.tar.gz
rm -f "$PACK"
FILES=()
for f in \
  docs/selling/_intelliops_hs_report.json \
  docs/selling/_intelliops_thread.json \
  docs/selling/_intelliops_registry_patch.json \
  docs/selling/drafts/intelliops-bd-email.txt \
  docs/selling/drafts/intelliops-reply-2026-08-25.txt
do
  [ -f "$f" ] && FILES+=("$f")
done
if [ "${#FILES[@]}" -gt 0 ]; then
  tar -czf "$PACK" "${FILES[@]}"
  echo "--- packed ${#FILES[@]} file(s) → $PACK ---"
fi

exit $RC
