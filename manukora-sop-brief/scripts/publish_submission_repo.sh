#!/usr/bin/env bash
# Publish the Manukora submission repo. Must run as ElenaRevicheva (gh auth).
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="$HERE/docs/evidence/manukora-sop-brief.bundle"
DEST="${1:-$HOME/manukora-sop-brief}"

if [[ ! -f "$BUNDLE" ]]; then
  echo "Missing $BUNDLE"
  exit 1
fi

rm -rf "$DEST"
git clone "$BUNDLE" "$DEST"
cd "$DEST"

# Re-point origin at the new GitHub repo (bundle has no useful remote).
gh repo create ElenaRevicheva/manukora-sop-brief --public \
  --description "Manukora S&OP briefing automation — AI Automation Engineer practical brief" \
  --source=. --remote=origin --push

echo ""
echo "Submission URL: https://github.com/ElenaRevicheva/manukora-sop-brief"
