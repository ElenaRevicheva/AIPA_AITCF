#!/usr/bin/env bash
# set-venice-stdin.sh — accept a Venice.ai API key on STDIN, PROVE it works,
# and only then write it to .env.
#
# Same contract as set-deepseek-stdin.sh. The value arrives on STDIN and never
# touches argv, so it cannot appear in `ps`; the curl Authorization header is
# passed via --config on stdin for the same reason. Nothing is written unless
# Venice accepts the key. A .env holding a key that 401s is worse than an empty one.
set -euo pipefail

ENV_FILE=/home/ubuntu/cto-aipa/.env
read -r KEY || true
KEY="$(printf '%s' "${KEY:-}" | tr -d '[:space:]')"

if [ -z "$KEY" ]; then
  echo "ERR: empty key on stdin"; exit 0
fi

# --- probe before write -----------------------------------------------------
# Models list: cheapest authenticated call Venice has; we only care about the status.
CODE="$(printf 'header = "Authorization: Bearer %s"\n' "$KEY" | curl -sS \
  --config - \
  -o /tmp/venice-probe.$$ -w '%{http_code}' \
  --max-time 60 \
  'https://api.venice.ai/api/v1/models?type=image' || echo 000)"
MODELS="$(grep -o '"id"' /tmp/venice-probe.$$ 2>/dev/null | wc -l || echo 0)"
rm -f /tmp/venice-probe.$$

case "$CODE" in
  200) : ;;
  401|403) echo "ERR: Venice rejected that key (HTTP $CODE). Nothing written. Check it at venice.ai/settings/api"; exit 0 ;;
  402)     echo "ERR: Venice says the account has no credits (HTTP 402). Nothing written — add credits at venice.ai/pricing, then resend."; exit 0 ;;
  429)     echo "ERR: rate limited (HTTP 429). Nothing written. Wait a moment and resend."; exit 0 ;;
  000)     echo "ERR: could not reach api.venice.ai from the box. Nothing written."; exit 0 ;;
  *)       echo "ERR: unexpected HTTP $CODE from Venice. Nothing written."; exit 0 ;;
esac

# --- write (idempotent: replace existing lines, else append) ----------------
cp "$ENV_FILE" "$ENV_FILE.bak-venice-$(date +%Y%m%d-%H%M%S)"
TMP="$(mktemp)"
grep -v -E '^(VENICE_API_KEY|VENICE_IMAGE_MODEL)=' "$ENV_FILE" > "$TMP" || true
printf 'VENICE_API_KEY=%s\n' "$KEY" >> "$TMP"
printf 'VENICE_IMAGE_MODEL=venice-sd35\n' >> "$TMP"
cat "$TMP" > "$ENV_FILE"
rm -f "$TMP"

echo "OK: key verified (HTTP $CODE, $MODELS image models visible) and written to .env — /imagine venice works after cto-aipa restarts with --update-env."
