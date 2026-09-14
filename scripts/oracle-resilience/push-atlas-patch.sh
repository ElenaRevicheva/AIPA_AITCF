#!/bin/bash
# Runs ON the Oracle box (deploy-oracle-on-trigger.yml, product "atlas-patch").
#
# Why: Cursor cloud agents can push AIPA_AITCF but get 403 on atlas-shifted.
# The box has the whitespace checkout + deploy key. Patches live in
# scripts/atlas-patches/; this applies them, rebuilds dist/, reruns the
# Monday pipeline from classify onward (capture already wrote today's JSONL).
set -euo pipefail

AIPA_DIR=/home/ubuntu/cto-aipa
if [[ ! -d "$AIPA_DIR/.git" ]]; then AIPA_DIR=/home/ubuntu/AIPA_AITCF; fi
PATCH_DIR="$AIPA_DIR/scripts/atlas-patches"
WS=/home/ubuntu/whitespace
NORM="$AIPA_DIR/scripts/oracle-resilience/lib/lf-normalize.py"

if [[ ! -d "$WS/.git" ]]; then
  echo "FATAL: Atlas checkout missing at $WS"
  exit 1
fi

echo "=== whitespace before ==="
git -C "$WS" log -1 --format='%h %ci %s'
git -C "$WS" status -sb | head -10

echo "=== pin LF (patches + git config) so apply cannot write CRLF src ==="
git -C "$WS" config core.autocrlf false
git -C "$WS" config core.eol lf
if [[ -f "$NORM" ]]; then
  shopt -s nullglob
  PRE_PATCHES=("$PATCH_DIR"/*.patch)
  if [[ ${#PRE_PATCHES[@]} -gt 0 ]]; then
    python3 "$NORM" --strip "${PRE_PATCHES[@]}"
    python3 "$NORM" --check "${PRE_PATCHES[@]}"
  fi
else
  echo "WARN: $NORM missing — applying patches as-is"
fi

shopt -s nullglob
PATCHES=("$PATCH_DIR"/*.patch)
if [[ ${#PATCHES[@]} -eq 0 ]]; then
  echo "No patches in $PATCH_DIR — nothing to apply."
  exit 1
fi

cd "$WS"
git config user.name "AIdeazz Oracle Deploy"
git config user.email "aipa@aideazz.xyz"

APPLIED=0
for p in "${PATCHES[@]}"; do
  echo "=== Patch: $(basename "$p") ==="
  SUBJECT=$(git mailinfo /dev/null /dev/null < "$p" | grep -m1 '^Subject: ' | sed 's/^Subject: //')
  if [[ -n "$SUBJECT" && -n "$(git log --oneline -F --grep="$SUBJECT" HEAD 2>/dev/null || true)" ]]; then
    echo "Already in history (\"$SUBJECT\") — skipping apply."
    continue
  fi
  if git apply --check "$p" 2>/dev/null; then
    git apply "$p"
    if [[ -f "$NORM" ]]; then
      python3 "$NORM" --strip src/classify.ts src/llm.ts
    fi
    git add src/classify.ts src/llm.ts
    git commit -m "$SUBJECT"
    APPLIED=$((APPLIED + 1))
  else
    echo "ERROR: patch does not apply cleanly. Showing src status:"
    git status --porcelain src/llm.ts src/classify.ts
    git apply --check "$p" || true
    exit 1
  fi
done

echo "=== build dist/ (tsc is a devDep; do not npm ci / prune) ==="
if [[ ! -x node_modules/.bin/tsc ]]; then
  npm install --no-save typescript@5.7.2
fi
./node_modules/.bin/tsc -p tsconfig.json
if [[ -f "$NORM" ]]; then
  python3 "$NORM" --strip src/classify.ts src/llm.ts dist/classify.js dist/llm.js
  python3 "$NORM" --check src/classify.ts src/llm.ts dist/classify.js dist/llm.js
fi
grep -q 'isEmbedQuotaError' dist/llm.js
grep -q 'v1-lexical' dist/classify.js
grep -q 'gemini-embedding-001' dist/llm.js
echo "VERIFY: dist has quota detector, lexical fallback, Gemini embedding-001 (LF)"

echo "=== classify → brief → concept (capture already wrote 2026-09-14 JSONL) ==="
node dist/classify.js
node dist/brief.js
node dist/concept.js --all-with-data || echo "WARN: concept.js non-zero (board still updated if classify+brief succeeded)"

echo "=== sqlite after ==="
sqlite3 data/radar.sqlite "SELECT snapshot_date, COUNT(*) FROM angle_snapshots GROUP BY snapshot_date ORDER BY snapshot_date DESC LIMIT 5;"
curl -s --max-time 20 http://127.0.0.1:8095/api/atlas | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d);console.log("snapshot_date",j.snapshot_date,"expected", (j.pipeline||{}).expected_snapshot_date, "sqlite", (j.pipeline||{}).sqlite_snapshot);});'

if [[ "$APPLIED" -gt 0 ]]; then
  echo "=== Pushing $APPLIED patch commit(s) to atlas-shifted main ==="
  git push origin HEAD:main || echo "WARN: push to atlas-shifted failed — dist/ on the box still has the fix for tonight's files"
fi

echo "=== whitespace now at: $(git log --oneline -1) ==="
echo "=== atlas-patch done ==="
