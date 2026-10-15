#!/usr/bin/env bash
# set-bluesky-stdin.sh — accept "<handle> <app-password>" on STDIN, PROVE it logs in to Bluesky, and only then write
# BLUESKY_HANDLE / BLUESKY_APP_PASSWORD to .env (15 Oct 2026; same contract as set-deepseek-stdin.sh).
#
# Called by the bot's /blueskykey command after it deleted Elena's message. The values never touch argv, so they
# cannot appear in `ps`; the login body goes to curl on stdin for the same reason. Nothing is written unless
# Bluesky's createSession answers 200. An APP password only (revocable on its own), never her account password.
set -euo pipefail

ENV_FILE=/home/ubuntu/cto-aipa/.env
read -r HANDLE PW || true
HANDLE="$(printf '%s' "${HANDLE:-}" | tr -d '[:space:]' | sed 's/^@//')"
PW="$(printf '%s' "${PW:-}" | tr -d '[:space:]')"

if [ -z "$HANDLE" ] || [ -z "$PW" ]; then
  echo "ERR: expected '<handle> <app-password>' on stdin"; exit 0
fi
if ! printf '%s' "$HANDLE" | grep -Eqi '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$'; then
  echo "ERR: that handle does not look like name.bsky.social"; exit 0
fi
if ! printf '%s' "$PW" | grep -Eqi '^[a-z0-9]{4}(-[a-z0-9]{4}){3}$'; then
  echo "ERR: that is not an app password (expected xxxx-xxxx-xxxx-xxxx). Create one in Bluesky → Settings → Privacy and security → App passwords"; exit 0
fi

# --- probe before write ------------------------------------------------------
CODE="$(printf '{"identifier":"%s","password":"%s"}' "$HANDLE" "$PW" | curl -sS \
  -o /tmp/bluesky-probe.$$ -w '%{http_code}' --max-time 30 \
  -H 'Content-Type: application/json' --data @- \
  https://bsky.social/xrpc/com.atproto.server.createSession || echo 000)"
rm -f /tmp/bluesky-probe.$$

case "$CODE" in
  200) : ;;
  401) echo "ERR: Bluesky rejected that handle/app password (HTTP 401). Nothing written."; exit 0 ;;
  429) echo "ERR: rate limited (HTTP 429). Nothing written. Wait a moment and resend."; exit 0 ;;
  000) echo "ERR: could not reach bsky.social from the box. Nothing written."; exit 0 ;;
  *)   echo "ERR: unexpected HTTP $CODE from Bluesky. Nothing written."; exit 0 ;;
esac

# --- write (idempotent: replace existing lines, else append) -----------------
cp "$ENV_FILE" "$ENV_FILE.bak-bluesky-$(date +%Y%m%d-%H%M%S)"
TMP="$(mktemp)"
grep -v -E '^(BLUESKY_HANDLE|BLUESKY_APP_PASSWORD)=' "$ENV_FILE" > "$TMP" || true
printf 'BLUESKY_HANDLE=%s\n' "$HANDLE" >> "$TMP"
printf 'BLUESKY_APP_PASSWORD=%s\n' "$PW" >> "$TMP"
cat "$TMP" > "$ENV_FILE"
rm -f "$TMP"

echo "OK: logged in to Bluesky as $HANDLE (HTTP 200) and wrote it to .env — the daily blog posts there after cto-aipa restarts with --update-env."
