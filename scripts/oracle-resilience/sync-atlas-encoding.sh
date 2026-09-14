#!/bin/bash
# Runs ON the Oracle box (deploy-oracle-on-trigger.yml, product "atlas-encoding-sync").
#
# Pin Atlas classify/llm to LF across:
#   1. atlas-shifted git (origin/main blobs)
#   2. Oracle /home/ubuntu/whitespace working tree + gitignored dist/
#   3. AIPA patch-relay copies on this box
#
# dist/ is gitignored. A later `git pull` + `npm ci --omit=dev` does not
# recompile, so the lexical fallback lives on disk. CRLF on src makes
# `git pull --ff-only` fail and tempts a checkout that *looks* like the
# workaround vanished. This script never re-runs classify and never
# restarts PM2.
set -euo pipefail

AIPA_DIR=/home/ubuntu/cto-aipa
if [[ ! -d "$AIPA_DIR/.git" ]]; then AIPA_DIR=/home/ubuntu/AIPA_AITCF; fi
WS=/home/ubuntu/whitespace
NORM="$AIPA_DIR/scripts/oracle-resilience/lib/lf-normalize.py"
PATCH_DIR="$AIPA_DIR/scripts/atlas-patches"

if [[ ! -d "$WS/.git" ]]; then
  echo "FATAL: Atlas checkout missing at $WS"
  exit 1
fi
if [[ ! -f "$NORM" ]]; then
  echo "FATAL: lf-normalize.py missing at $NORM"
  exit 1
fi

SRC_FILES=(src/llm.ts src/classify.ts)
DIST_FILES=(dist/llm.js dist/classify.js)
MARK_SRC_LEXICAL='v1-lexical'
MARK_SRC_QUOTA='isEmbedQuotaError'
MARK_SRC_GEMINI='gemini-embedding-001'

report_paths() {
  local -a files=()
  local f
  for f in "$@"; do
    [[ -e "$f" ]] && files+=("$f")
  done
  if [[ ${#files[@]} -eq 0 ]]; then
    echo "(none exist)"
    return 0
  fi
  python3 "$NORM" "${files[@]}"
}

require_marker() {
  local file="$1" needle="$2"
  if [[ ! -f "$file" ]]; then
    echo "FATAL: missing $file (needed for $needle)"
    return 1
  fi
  if grep -q "$needle" "$file"; then
    echo "OK marker $needle in $file"
    return 0
  fi
  echo "FATAL: $file lost $needle"
  return 1
}

echo "=== host ==="
date -u +%FT%TZ
echo "AIPA_DIR=$AIPA_DIR"
echo "WS=$WS"

echo "=== git identity / autocrlf BEFORE ==="
git -C "$WS" log -1 --format='%h %ci %s'
git -C "$WS" status -sb | head -15
echo -n "core.autocrlf="; git -C "$WS" config --get core.autocrlf || echo unset
echo -n "core.eol="; git -C "$WS" config --get core.eol || echo unset
echo -n "core.safecrlf="; git -C "$WS" config --get core.safecrlf || echo unset

echo "=== encoding BEFORE (src / dist / patches) ==="
( cd "$WS" && report_paths "${SRC_FILES[@]}" "${DIST_FILES[@]}" )
shopt -s nullglob
PATCHES=("$PATCH_DIR"/*.patch)
if [[ ${#PATCHES[@]} -gt 0 ]]; then
  python3 "$NORM" "${PATCHES[@]}"
else
  echo "WARN: no patches in $PATCH_DIR"
fi

echo "=== pin whitespace git to LF (does not rewrite history) ==="
git -C "$WS" config core.autocrlf false
git -C "$WS" config core.eol lf
git -C "$AIPA_DIR" config core.autocrlf false || true
git -C "$AIPA_DIR" config core.eol lf || true

echo "=== strip CR/BOM on working copies ==="
( cd "$WS" && python3 "$NORM" --strip "${SRC_FILES[@]}" )
( cd "$WS" && python3 "$NORM" --strip "${DIST_FILES[@]}" || true )
if [[ ${#PATCHES[@]} -gt 0 ]]; then
  python3 "$NORM" --strip "${PATCHES[@]}"
fi

echo "=== fetch atlas-shifted origin/main (source of truth for src) ==="
git -C "$WS" fetch origin main

echo "=== src vs origin/main (ignore CR) ==="
if git -C "$WS" diff --quiet --ignore-cr-at-eol origin/main -- "${SRC_FILES[@]}"; then
  echo "src matches origin/main ignoring CR — checking out git LF bytes"
  git -C "$WS" checkout origin/main -- "${SRC_FILES[@]}"
else
  echo "WARN: src content differs from origin/main (not just CRLF):"
  git -C "$WS" diff --ignore-cr-at-eol --stat origin/main -- "${SRC_FILES[@]}" || true
  git -C "$WS" diff --ignore-cr-at-eol origin/main -- "${SRC_FILES[@]}" | head -80
fi

echo "=== pin .gitattributes so future checkouts stay LF ==="
ATTR="$WS/.gitattributes"
python3 - "$ATTR" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
existing = path.read_text(encoding="utf-8") if path.exists() else ""
wanted = [
    "* text=auto",
    "*.sh text eol=lf",
    "*.ts text eol=lf",
    "*.js text eol=lf",
    "*.mjs text eol=lf",
    "*.cjs text eol=lf",
    "*.json text eol=lf",
]
lines = [ln.rstrip("\r") for ln in existing.splitlines() if ln.strip()]
for item in wanted:
    if item not in lines:
        lines.append(item)
text = "\n".join(lines) + "\n"
if text != existing.replace("\r\n", "\n"):
    path.write_bytes(text.encode("utf-8"))
    print(f"updated {path}")
else:
    print(f"unchanged {path}")
PY

echo "=== lexical markers in src ==="
require_marker "$WS/src/classify.ts" "$MARK_SRC_LEXICAL"
require_marker "$WS/src/llm.ts" "$MARK_SRC_QUOTA"
require_marker "$WS/src/llm.ts" "$MARK_SRC_GEMINI"

echo "=== dist (gitignored runtime) ==="
DIST_OK=1
if [[ -f "$WS/dist/classify.js" && -f "$WS/dist/llm.js" ]] \
  && grep -q "$MARK_SRC_LEXICAL" "$WS/dist/classify.js" \
  && grep -q "$MARK_SRC_QUOTA" "$WS/dist/llm.js" \
  && grep -q "$MARK_SRC_GEMINI" "$WS/dist/llm.js"; then
  echo "dist already has quota detector + gemini-001 + v1-lexical"
else
  echo "WARN: dist missing lexical failover — rebuilding from LF src (no classify run)"
  DIST_OK=0
fi

if [[ "$DIST_OK" -eq 0 ]]; then
  cd "$WS"
  if [[ ! -x node_modules/.bin/tsc ]]; then
    npm install --no-save typescript@5.7.2
  fi
  ./node_modules/.bin/tsc -p tsconfig.json
  python3 "$NORM" --strip "${DIST_FILES[@]}"
fi

require_marker "$WS/dist/classify.js" "$MARK_SRC_LEXICAL"
require_marker "$WS/dist/llm.js" "$MARK_SRC_QUOTA"
require_marker "$WS/dist/llm.js" "$MARK_SRC_GEMINI"
python3 "$NORM" --check "$WS/src/llm.ts" "$WS/src/classify.ts" "$WS/dist/llm.js" "$WS/dist/classify.js"

echo "=== THREE-WAY HASH (src blobs) ==="
MATCH=1
for f in "${SRC_FILES[@]}"; do
  WT=$(git -C "$WS" hash-object "$f")
  HEAD=$(git -C "$WS" rev-parse "HEAD:$f" 2>/dev/null || echo missing)
  ORIGIN=$(git -C "$WS" rev-parse "origin/main:$f")
  echo "$f worktree=$WT HEAD=$HEAD origin/main=$ORIGIN"
  if [[ "$WT" != "$ORIGIN" ]]; then
    echo "MISMATCH $f worktree vs origin/main"
    MATCH=0
  else
    echo "MATCH $f worktree == origin/main"
  fi
done

if [[ ${#PATCHES[@]} -gt 0 ]]; then
  python3 "$NORM" --check "${PATCHES[@]}"
  echo "OK AIPA patches are LF"
fi

if [[ "$MATCH" -ne 1 ]]; then
  echo "FATAL: worktree src blobs do not match origin/main after LF pin"
  git -C "$WS" diff --ignore-cr-at-eol origin/main -- "${SRC_FILES[@]}" | head -80
  exit 1
fi

echo "=== commit .gitattributes on atlas-shifted if needed ==="
git -C "$WS" config user.name "AIdeazz Oracle Deploy"
git -C "$WS" config user.email "aipa@aideazz.xyz"
git -C "$WS" add .gitattributes
if git -C "$WS" diff --cached --quiet -- .gitattributes; then
  echo "gitattributes already committed"
else
  git -C "$WS" commit -m "$(cat <<'EOF'
chore(atlas): pin TS/JS to LF so lexical classify cannot be lost to CRLF

dist/ is gitignored. A CRLF working tree blocks git pull --ff-only and
makes a later checkout look like the v1-lexical workaround vanished.
EOF
)"
  git -C "$WS" push origin HEAD:main || echo "WARN: push gitattributes failed — box still has LF files"
fi

echo "=== git identity AFTER ==="
git -C "$WS" log -1 --format='%h %ci %s'
git -C "$WS" status -sb | head -15
echo -n "core.autocrlf="; git -C "$WS" config --get core.autocrlf
echo -n "core.eol="; git -C "$WS" config --get core.eol

echo "=== encoding AFTER ==="
( cd "$WS" && python3 "$NORM" --check "${SRC_FILES[@]}" "${DIST_FILES[@]}" )
echo -n "dist classify.js file(1): "; file "$WS/dist/classify.js"
echo -n "src classify.ts file(1): "; file "$WS/src/classify.ts"

if [[ "$MATCH" -ne 1 ]]; then
  echo "FATAL: worktree src blobs do not match origin/main after LF pin"
  exit 1
fi

echo "=== atlas-encoding-sync done: git == Oracle src == LF, dist keeps v1-lexical ==="
