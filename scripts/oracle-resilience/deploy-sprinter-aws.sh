#!/bin/bash
# Deploy Sprinter (AWS Lambda) from Oracle VM — requires ~/.aws/credentials or env vars.
# Prefer GitHub Actions job deploy-aws-sprinter when AWS secrets are in GitHub.
set -euo pipefail

AIPA_DIR="${AIPA_DIR:-/home/ubuntu/cto-aipa}"
cd "$AIPA_DIR"

echo "=== Sprinter AWS Lambda deploy (#8.1) ==="
git fetch origin main
git checkout origin/main -- scripts/deploy-lambda.mjs src/sprint-briefing/ 2>/dev/null || git pull --ff-only origin main

if [[ ! -f dist-lambda/sprint/handler-fixed.zip ]]; then
  echo "Building Lambda bundle..."
  npx esbuild src/lambda/sprint-briefing-aws.ts --bundle --platform=node --target=node20 --format=cjs \
    --external:@aws-sdk/signature-v4-crt --external:encoding \
    --outfile=dist-lambda/sprint/lambda-pkg/handler.js
  python3 - <<'PY'
import zipfile, pathlib
root = pathlib.Path("dist-lambda/sprint/lambda-pkg")
out = pathlib.Path("dist-lambda/sprint/handler-fixed.zip")
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(root / "handler.js", "handler.js")
print("Wrote", out)
PY
fi

node scripts/deploy-lambda.mjs
echo "=== Sprinter Lambda deploy done ==="
