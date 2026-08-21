#!/bin/bash
# Runs ON Oracle. Re-puts one cached article via GitHub Contents API
# (same path as the daily publisher — author Elena, no skip-ci).
set -euo pipefail

SLUG="${BLOG_REPUBLISH_SLUG:?Set BLOG_REPUBLISH_SLUG to the article slug}"
AIPA_DIR=/home/ubuntu/cto-aipa
if [ ! -d "$AIPA_DIR/.git" ]; then AIPA_DIR=/home/ubuntu/AIPA_AITCF; fi

cd "$AIPA_DIR"
echo "=== republish-blog-html: $SLUG in $AIPA_DIR ==="
if [ ! -f dist/blog-static-pages.js ]; then
  echo "FATAL: dist/blog-static-pages.js missing — deploy cto_aipa first"
  exit 1
fi
node scripts/republish-blog-html.cjs "$SLUG"
echo "=== republish-blog-html done ==="
