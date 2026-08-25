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
  scripts/hs-email-link-deal.cjs \
  scripts/intelliops-imap-pull.py \
  scripts/hs-env.cjs \
  scripts/wa-link-lib.cjs \
  docs/selling/drafts/intelliops-reply-2026-08-25.txt \
  docs/selling/drafts/intelliops-bd-email.txt \
  docs/selling/_intelliops_hs_report.json \
  2>&1 || { echo "FATAL: checkout of HubSpot note files failed"; exit 1; }

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
elif [[ "$CMD" == email-link* ]]; then
  DEAL="${3:-}"
  if [ -z "$DEAL" ]; then
    DEAL=$(echo "$CMD" | awk '{print $2}')
  fi
  DEAL=$(echo "$DEAL" | tr -cd '0-9')
  echo "--- node scripts/hs-email-link-deal.cjs $DEAL ---"
  set +e
  node scripts/hs-email-link-deal.cjs "$DEAL" 2>&1
  RC=$?
  set -e
  echo "--- email-link exit code: $RC ---"
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
  echo "--- copied intelliops report ---"
fi
if [ -f docs/selling/_email_link_deal_report.json ]; then
  cp docs/selling/_email_link_deal_report.json /tmp/email-link-deal-report.json
  echo "--- copied email-link report ---"
  node -e 'const j=require("./docs/selling/_email_link_deal_report.json"); const n=String(j.latestNoteText||""); j.latestNoteText=`[${n.length} chars]`; console.log(JSON.stringify(j,null,2));'
fi

# Pack selling artifacts this run wrote (not the whole dirty docs/selling tree).
PACK=/tmp/intelliops-story.tar.gz
rm -f "$PACK"
FILES=()
for f in \
  docs/selling/_intelliops_hs_report.json \
  docs/selling/_intelliops_thread.json \
  docs/selling/_intelliops_registry_patch.json \
  docs/selling/_email_link_deal_report.json \
  docs/selling/_email_link_registry_patch.json \
  docs/selling/drafts/intelliops-bd-email.txt \
  docs/selling/drafts/intelliops-reply-2026-08-25.txt
do
  [ -f "$f" ] && FILES+=("$f")
done
if [ -f docs/selling/_email_link_deal_report.json ]; then
  DRAFT=$(node -e 'try{const j=require("./docs/selling/_email_link_deal_report.json"); if(j.emailDraft) console.log(j.emailDraft)}catch(e){}')
  [ -n "$DRAFT" ] && [ -f "$DRAFT" ] && FILES+=("$DRAFT")
fi
if [ "${#FILES[@]}" -gt 0 ]; then
  tar -czf "$PACK" "${FILES[@]}"
  echo "--- packed ${#FILES[@]} file(s) → $PACK ---"
fi

exit $RC
