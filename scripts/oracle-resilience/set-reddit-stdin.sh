#!/bin/bash
# Writes REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET into cto-aipa's .env.
# Values arrive on STDIN (never argv, so they cannot surface in `ps`).
# The caller has ALREADY probed Reddit — this only persists what worked.
set -uo pipefail
ENV=/home/ubuntu/cto-aipa/.env
read -r ID   || { echo "FAILED: no client id on stdin"; exit 1; }
read -r SEC  || { echo "FAILED: no secret on stdin"; exit 1; }
[ -n "$ID" ] && [ -n "$SEC" ] || { echo "FAILED: empty value"; exit 1; }

cp "$ENV" "$ENV.bak-reddit-$(date +%s)"
# Replace in place if present, else append. Never duplicate a key.
for pair in "REDDIT_CLIENT_ID=$ID" "REDDIT_CLIENT_SECRET=$SEC"; do
  key="${pair%%=*}"
  if grep -q "^${key}=" "$ENV"; then
    grep -v "^${key}=" "$ENV" > "$ENV.tmp" && mv "$ENV.tmp" "$ENV"
  fi
  printf '%s\n' "$pair" >> "$ENV"
done
chmod 600 "$ENV"
pm2 restart cto-aipa --update-env >/dev/null 2>&1
echo "OK: credentials written and cto-aipa restarted. Listener will use OAuth instead of the blocked RSS endpoint."
