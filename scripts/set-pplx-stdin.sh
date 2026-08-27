#!/usr/bin/env bash
# set-pplx-stdin.sh — accept a Perplexity API key on STDIN, PROVE it works,
# and only then write it to .env.
#
# Same contract as set-gmail-stdin.sh, and for the same reason: Elena is
# usually on her phone with no terminal, and a key that is pasted into a chat
# is a key that has to be rotated. The value arrives on STDIN and never touches
# argv, so it cannot appear in `ps`. The curl header is passed via --config on
# stdin for the same reason -- `-H "Authorization: Bearer ..."` would be visible
# in the process list.
#
# Nothing is written unless Perplexity actually accepts the key. A .env full of
# a key that 401s is worse than an empty one: it looks configured and is not.
set -euo pipefail

ENV_FILE=/home/ubuntu/cto-aipa/.env
read -r KEY || true
KEY="$(printf '%s' "${KEY:-}" | tr -d '[:space:]')"

if [ -z "$KEY" ]; then
  echo "ERR: empty key on stdin"; exit 0
fi
case "$KEY" in
  pplx-*) : ;;
  *) echo "ERR: that does not look like a Perplexity key (expected it to start with pplx-)"; exit 0 ;;
esac

# --- probe before write -----------------------------------------------------
# Minimal real request. Cheapest preset, tiny output cap. We only care about the
# HTTP status: 200 proves the key is live, 401 proves it is not.
CODE="$(printf 'header = "Authorization: Bearer %s"\n' "$KEY" | curl -sS \
  --config - \
  -o /tmp/pplx-probe.$$ -w '%{http_code}' \
  --max-time 90 \
  -H 'Content-Type: application/json' \
  -d '{"preset":"low","input":"reply with the single word ok","max_output_tokens":16}' \
  https://api.perplexity.ai/v1/agent || echo 000)"
rm -f /tmp/pplx-probe.$$

case "$CODE" in
  200) : ;;
  401|403) echo "ERR: Perplexity rejected that key (HTTP $CODE). Nothing written. Check it at console.perplexity.ai"; exit 0 ;;
  429)     echo "ERR: rate limited (HTTP 429). Nothing written. Wait a moment and resend."; exit 0 ;;
  000)     echo "ERR: could not reach api.perplexity.ai from the box. Nothing written."; exit 0 ;;
  *)       echo "ERR: unexpected HTTP $CODE from Perplexity. Nothing written."; exit 0 ;;
esac

# --- write (idempotent: replace an existing line, else append) ---------------
cp "$ENV_FILE" "$ENV_FILE.bak-pplx-$(date +%Y%m%d-%H%M%S)"
if grep -q '^PERPLEXITY_API_KEY=' "$ENV_FILE"; then
  TMP="$(mktemp)"
  grep -v '^PERPLEXITY_API_KEY=' "$ENV_FILE" > "$TMP"
  printf 'PERPLEXITY_API_KEY=%s\n' "$KEY" >> "$TMP"
  cat "$TMP" > "$ENV_FILE"
  rm -f "$TMP"
  ACTION="replaced"
else
  printf '\nPERPLEXITY_API_KEY=%s\n' "$KEY" >> "$ENV_FILE"
  ACTION="added"
fi

echo "OK: key verified (HTTP 200) and $ACTION in .env — Perplexity is the 4th citation engine, and the competitor probe can run."
