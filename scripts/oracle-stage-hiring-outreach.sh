#!/usr/bin/env bash
# Run stage-hiring-outreach.cjs on the Oracle VM, where .env lives.
#
# A Cursor cloud agent has no HUBSPOT_API_KEY and no egress to api.hubapi.com.
# This script is piped over ssh by .github/workflows/hire-outreach-on-trigger.yml.
# It tars back whatever the run wrote under docs/selling so the registry and the
# draft can be committed. That commit is not optional: /go/outreach-email/{slug}
# falls back to GitHub main when Oracle disk is stale.
#
# Usage (on Oracle): bash oracle-stage-hiring-outreach.sh <ref> <spec-relpath> [--dry-run]
set -uo pipefail

REF="${1:?ref required}"
SPEC="${2:?spec path required}"
shift 2
FLAGS=("$@")

AIPA_DIR=/home/ubuntu/cto-aipa
[ -d "$AIPA_DIR/.git" ] || AIPA_DIR=/home/ubuntu/AIPA_AITCF
cd "$AIPA_DIR" || { echo "FATAL: no cto-aipa checkout on this box"; exit 1; }
echo "--- staging $SPEC in $AIPA_DIR as $(whoami) ---"

if [ ! -f .env ]; then
  echo "FATAL: .env missing on Oracle — HUBSPOT_API_KEY unavailable"
  exit 1
fi

# Named files only. Oracle's checkout is meant to lag; never git pull.
echo "--- fetching $REF ---"
git fetch origin "$REF" 2>&1 || { echo "FATAL: fetch $REF failed"; exit 1; }
git checkout FETCH_HEAD -- \
  scripts/stage-hiring-outreach.cjs \
  scripts/hs-env.cjs \
  "$SPEC" \
  2>&1 || { echo "FATAL: checkout of staging files from $REF failed"; exit 1; }

# Union GitHub's committed registry with whatever is already on this disk so a
# lagging Oracle checkout cannot drop keys (AfterQuery was lost that way once).
# GitHub wins on a key both have — that is the committed source of truth.
echo "--- merging outreach-registry.json (GitHub ∪ Oracle disk) ---"
git show "FETCH_HEAD:docs/selling/outreach-registry.json" > /tmp/gh-outreach-registry.json 2>/dev/null \
  || { echo "FATAL: GitHub registry missing on $REF"; exit 1; }
node -e '
  const fs = require("fs");
  const gh = JSON.parse(fs.readFileSync("/tmp/gh-outreach-registry.json", "utf8"));
  let disk = {};
  try { disk = JSON.parse(fs.readFileSync("docs/selling/outreach-registry.json", "utf8")); } catch { /* first run */ }
  const out = { ...disk, ...gh };
  const added = Object.keys(gh).filter((k) => !disk[k]).length;
  const kept = Object.keys(disk).filter((k) => !gh[k]).length;
  fs.writeFileSync("docs/selling/outreach-registry.json", JSON.stringify(out, null, 2) + "\n");
  console.log("  registry keys:", Object.keys(out).length, "(+" + added, "from GitHub, kept", kept, "Oracle-only)");
'

snapshot() { find docs/selling -type f -exec md5sum {} + 2>/dev/null | sort; }
BEFORE=$(mktemp)
snapshot > "$BEFORE"

echo "--- node scripts/stage-hiring-outreach.cjs $SPEC ${FLAGS[*]-} ---"
set +e
node scripts/stage-hiring-outreach.cjs "$SPEC" "${FLAGS[@]}" 2>&1
RC=$?
set -e
echo "--- stage exit code: $RC ---"

AFTER=$(mktemp)
snapshot > "$AFTER"
CHANGED=$(mktemp)
comm -13 "$BEFORE" "$AFTER" | sed 's/^[0-9a-f]*  //' | sort -u > "$CHANGED"

OUT=/tmp/stage-hiring-output.tar.gz
rm -f "$OUT"
if [ -s "$CHANGED" ]; then
  echo "--- this run touched: ---"
  sed 's/^/      /' "$CHANGED"
  tar -czf "$OUT" -T "$CHANGED" 2>/dev/null && echo "--- packed $(wc -l < "$CHANGED") file(s) → $OUT ---"
else
  echo "--- no docs/selling changes to pack (dry run, or nothing written) ---"
fi
rm -f "$BEFORE" "$AFTER" "$CHANGED" /tmp/gh-outreach-registry.json

exit $RC
