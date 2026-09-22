#!/usr/bin/env bash
# set-venice-stdin.sh — accept a Venice.ai API key on STDIN, PROVE it works,
# and only then write it to .env.
#
# Same contract as set-deepseek-stdin.sh. The value arrives on STDIN and never
# touches argv, so it cannot appear in `ps`; the curl Authorization header is
# passed via --config on stdin for the same reason.
#
# ⚠️ THE PROBE MUST REQUIRE AUTH, AND MUST BE THE THING WE ACTUALLY NEED. Venice's
# /models endpoint is PUBLIC (22 Sep 2026: 200 with no key at all, and 200 with a
# deliberately fake key), so probing it verified nothing and wrote keys that could not
# spend a cent. /api_keys/* may be admin-only, which would reject a perfectly good
# inference key. So the probe is a 1-token chat completion: if that succeeds, the key
# can run inference, which is the whole point.
#
# VENICE_ENV_FILE overrides the target file, so this script can be tested
# without touching the live .env.
set -euo pipefail

ENV_FILE="${VENICE_ENV_FILE:-/home/ubuntu/cto-aipa/.env}"
read -r KEY || true
KEY="$(printf '%s' "${KEY:-}" | tr -d '[:space:]')"

if [ -z "$KEY" ]; then
  echo "ERR: empty key on stdin"; exit 0
fi

# --- probe before write -----------------------------------------------------
PROBE_MODEL="${VENICE_PROBE_MODEL:-venice-uncensored}"
CODE="$(printf 'header = "Authorization: Bearer %s"\n' "$KEY" | curl -sS \
  --config - \
  -o /tmp/venice-probe.$$ -w '%{http_code}' \
  --max-time 90 \
  -H 'Content-Type: application/json' \
  -d "{\"model\":\"$PROBE_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"ok\"}],\"max_tokens\":1}" \
  'https://api.venice.ai/api/v1/chat/completions' || echo 000)"
BAL="$(grep -o '"error"[^,}]*' /tmp/venice-probe.$$ 2>/dev/null | head -c 120 || true)"
rm -f /tmp/venice-probe.$$

case "$CODE" in
  200) : ;;
  401|403)
    echo "ERR: Venice refused that key (HTTP $CODE). Nothing written."
    echo "     Venice answers 401 for BOTH a wrong key AND a key that is not allowed to spend."
    echo "     Check at venice.ai/settings/api: the key exists, its spend limit is above \$0, and the account has API credits."
    exit 0 ;;
  402) echo "ERR: Venice says no balance (HTTP 402). Nothing written — add credits at venice.ai/pricing, then resend."; exit 0 ;;
  429) echo "ERR: rate limited (HTTP 429). Nothing written. Wait a moment and resend."; exit 0 ;;
  000) echo "ERR: could not reach api.venice.ai from the box. Nothing written."; exit 0 ;;
  *)   echo "ERR: unexpected HTTP $CODE from Venice. Nothing written."; exit 0 ;;
esac

# --- write (idempotent: replace existing lines, else append) ----------------
cp "$ENV_FILE" "$ENV_FILE.bak-venice-$(date +%Y%m%d-%H%M%S)"
TMP="$(mktemp)"
grep -v -E '^(VENICE_API_KEY|VENICE_IMAGE_MODEL)=' "$ENV_FILE" > "$TMP" || true
printf 'VENICE_API_KEY=%s\n' "$KEY" >> "$TMP"
printf 'VENICE_IMAGE_MODEL=venice-sd35\n' >> "$TMP"
cat "$TMP" > "$ENV_FILE"
rm -f "$TMP"

echo "OK: key verified against an authenticated endpoint (HTTP $CODE) and written to .env — /imagine venice works after cto-aipa restarts with --update-env. ${BAL}"
