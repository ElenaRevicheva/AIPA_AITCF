#!/usr/bin/env bash
# Run the Manual Prospect Play on the Oracle VM, where .env lives.
#
# A Cursor cloud agent has no HUBSPOT_API_KEY and no egress to api.hubapi.com, so it
# cannot stage a prospect itself. Oracle has both. This script is piped to the box over
# ssh by .github/workflows/stage-prospect-on-trigger.yml; it runs stage-manual-prospect.cjs
# there and tars back whatever the run wrote under docs/selling, so the registry and the
# drafts can be committed to git. That commit is not optional: /go/outreach-email/{slug}
# resolves the slug from the committed registry, so an uncommitted staging run leaves the
# email button answering "Unknown outreach email slug".
#
# Usage (on Oracle): bash oracle-stage-prospect.sh <ref> <domain> [flags...]
set -uo pipefail

REF="${1:?ref required}"
DOMAIN="${2:?domain required}"
shift 2
FLAGS=("$@")

AIPA_DIR=/home/ubuntu/cto-aipa
[ -d "$AIPA_DIR/.git" ] || AIPA_DIR=/home/ubuntu/AIPA_AITCF
cd "$AIPA_DIR" || { echo "FATAL: no cto-aipa checkout on this box"; exit 1; }
echo "--- staging $DOMAIN in $AIPA_DIR as $(whoami) ---"

if [ ! -f .env ]; then
  echo "FATAL: .env missing on Oracle — HUBSPOT_API_KEY unavailable"
  exit 1
fi

# Match the scripts to the reviewed branch, the same way deploy-oracle-on-trigger.yml does.
echo "--- fetching $REF ---"
git fetch origin "$REF" 2>&1 || { echo "FATAL: fetch $REF failed"; exit 1; }
git checkout FETCH_HEAD -- scripts/ 2>&1 || echo "WARN: scripts/ checkout failed — using the copy already on the box"

# Snapshot docs/selling so only this run's output is shipped back. Staging appends to a
# shared 80KB registry, so sending the whole directory back would clobber concurrent work.
BEFORE=$(mktemp)
git status --porcelain -- docs/selling | awk '{print $2}' | sort > "$BEFORE"

echo "--- node scripts/stage-manual-prospect.cjs $DOMAIN ${FLAGS[*]-} ---"
set +e
node scripts/stage-manual-prospect.cjs "$DOMAIN" "${FLAGS[@]}" 2>&1
RC=$?
set -e
echo "--- stage exit code: $RC ---"

AFTER=$(mktemp)
git status --porcelain -- docs/selling | awk '{print $2}' | sort > "$AFTER"

OUT=/tmp/stage-prospect-output.tar.gz
rm -f "$OUT"
if [ -s "$AFTER" ]; then
  # The registry is shared, so ship it whenever it moved; drafts are per-slug and safe.
  tar -czf "$OUT" -T "$AFTER" 2>/dev/null && echo "--- packed $(wc -l < "$AFTER") changed file(s) → $OUT ---"
else
  echo "--- no docs/selling changes to pack (dry run, or nothing written) ---"
fi
diff "$BEFORE" "$AFTER" >/dev/null 2>&1 && echo "--- note: working tree unchanged under docs/selling ---"
rm -f "$BEFORE" "$AFTER"

exit $RC
