#!/bin/bash
# Runs in /home/ubuntu/whitespace after PRODUCT_atlas git pull / npm ci.
# dist/ is gitignored and tsc is a devDep, so pull does not refresh classify.js.
# Fail closed if the lexical fallback vanished; strip CR so src stays pullable.
set -euo pipefail

AIPA=/home/ubuntu/cto-aipa
if [[ ! -d "$AIPA/.git" ]]; then AIPA=/home/ubuntu/AIPA_AITCF; fi
NORM="$AIPA/scripts/oracle-resilience/lib/lf-normalize.py"
FILES=(src/classify.ts src/llm.ts dist/classify.js dist/llm.js)

if [[ -f "$NORM" ]]; then
  python3 "$NORM" --strip "${FILES[@]}" || true
else
  python3 - <<'PY'
from pathlib import Path
BOM = b"\xef\xbb\xbf"
for name in ("src/classify.ts", "src/llm.ts", "dist/classify.js", "dist/llm.js"):
    p = Path(name)
    if not p.is_file():
        continue
    raw = p.read_bytes()
    norm = raw[len(BOM):] if raw.startswith(BOM) else raw
    norm = norm.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    if norm != raw:
        p.write_bytes(norm)
        print(f"stripped CR {p}")
PY
fi

need_rebuild=0
if [[ ! -f dist/classify.js || ! -f dist/llm.js ]]; then
  echo "WARN: Atlas dist missing — will rebuild"
  need_rebuild=1
elif ! grep -q v1-lexical dist/classify.js || ! grep -q isEmbedQuotaError dist/llm.js || ! grep -q gemini-embedding-001 dist/llm.js; then
  echo "WARN: Atlas dist lost lexical failover — will rebuild from src"
  need_rebuild=1
fi

if [[ "$need_rebuild" -eq 1 ]]; then
  if [[ ! -x node_modules/.bin/tsc ]]; then
    npm install --no-save typescript@5.7.2
  fi
  ./node_modules/.bin/tsc -p tsconfig.json
  if [[ -f "$NORM" ]]; then
    python3 "$NORM" --strip dist/classify.js dist/llm.js
  fi
fi

grep -q v1-lexical dist/classify.js
grep -q isEmbedQuotaError dist/llm.js
grep -q gemini-embedding-001 dist/llm.js
echo "VERIFY: Atlas dist still has v1-lexical + quota detector + gemini-embedding-001"
