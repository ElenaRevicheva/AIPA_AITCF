#!/usr/bin/env bash
# set-deepseek-stdin.sh — accept a DeepSeek API key on STDIN, PROVE it works,
# and only then write it to .env.
#
# Same contract as set-pplx-stdin.sh / set-gmail-stdin.sh. Elena is on her
# phone. A key pasted into a Cursor/chat window is a key that has to be
# rotated. The value arrives on STDIN and never touches argv, so it cannot
# appear in `ps`. The curl Authorization header is passed via --config on
# stdin for the same reason.
#
# Nothing is written unless DeepSeek accepts the key (HTTP 200) or the key is
# valid with an empty wallet (HTTP 402 — she can top up without rotating).
# A .env holding a key that 401s is worse than an empty one.
set -euo pipefail

ENV_FILE=/home/ubuntu/cto-aipa/.env
read -r KEY || true
KEY="$(printf '%s' "${KEY:-}" | tr -d '[:space:]')"

if [ -z "$KEY" ]; then
  echo "ERR: empty key on stdin"; exit 0
fi
case "$KEY" in
  sk-*) : ;;
  *) echo "ERR: that does not look like a DeepSeek key (expected it to start with sk-)"; exit 0 ;;
esac

# --- probe before write -----------------------------------------------------
# Tiny completion. We only care about HTTP status.
CODE="$(printf 'header = "Authorization: Bearer %s"\n' "$KEY" | curl -sS \
  --config - \
  -o /tmp/deepseek-probe.$$ -w '%{http_code}' \
  --max-time 90 \
  -H 'Content-Type: application/json' \
  -d '{"model":"deepseek-flash","messages":[{"role":"user","content":"ok"}],"max_tokens":1}' \
  https://api.deepseek.com/chat/completions || echo 000)"
rm -f /tmp/deepseek-probe.$$

BALANCE_NOTE=""
case "$CODE" in
  200) : ;;
  402) BALANCE_NOTE=" Key is valid but the wallet is empty (HTTP 402) — top up at platform.deepseek.com." ;;
  401|403) echo "ERR: DeepSeek rejected that key (HTTP $CODE). Nothing written. Check it at platform.deepseek.com/api_keys"; exit 0 ;;
  429)     echo "ERR: rate limited (HTTP 429). Nothing written. Wait a moment and resend."; exit 0 ;;
  000)     echo "ERR: could not reach api.deepseek.com from the box. Nothing written."; exit 0 ;;
  *)       echo "ERR: unexpected HTTP $CODE from DeepSeek. Nothing written."; exit 0 ;;
esac

# --- write (idempotent: replace existing lines, else append) ---------------
cp "$ENV_FILE" "$ENV_FILE.bak-deepseek-$(date +%Y%m%d-%H%M%S)"
TMP="$(mktemp)"
grep -v -E '^(DEEPSEEK_API_KEY|DEEPSEEK_MODEL)=' "$ENV_FILE" > "$TMP" || true
printf 'DEEPSEEK_API_KEY=%s\n' "$KEY" >> "$TMP"
printf 'DEEPSEEK_MODEL=deepseek-flash\n' >> "$TMP"
cat "$TMP" > "$ENV_FILE"
rm -f "$TMP"

echo "OK: key verified (HTTP $CODE) and written to .env — Atuona will use DeepSeek V4.1 Flash after cto-aipa restarts with --update-env.${BALANCE_NOTE}"
