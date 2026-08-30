#!/usr/bin/env bash
# set-opspw-stdin.sh — reset the /ops/ basic-auth password for user `elena`.
#
# Called by the /opspw Telegram command in src/telegram-bot.ts. The password
# arrives on STDIN, never argv, so it cannot surface in `ps` or shell history.
#
# Contract, and the reason it differs from set-gmail-stdin.sh / set-pplx-stdin.sh:
# those two PROBE the provider before writing, because an API key can be tested
# without being installed. A password hash cannot — writing it IS the test. So
# this script inverts the order: back up, write, verify against the live
# endpoint, and ROLL BACK automatically if the verification fails. The failure
# mode being defended against is a reset that leaves the dashboard unreachable
# or, worse, unlocked.
#
# Prints exactly one final line: "OK: ..." on success, anything else on failure.
set -uo pipefail

fail() { echo "FAILED: $*"; exit 1; }

# IFS= is required: without it, `read` strips leading/trailing whitespace, which
# would set a password different from the one typed. The handler deliberately
# allows spaces in the password, so this must preserve them exactly.
IFS= read -r PW || fail "no password on stdin"
[ -n "${PW:-}" ] || fail "empty password; nothing written"

# Basic-auth has no rate limit in front of it, so length is the only real defence.
[ "${#PW}" -ge 12 ] || fail "password is ${#PW} chars; use at least 12. Nothing written."

# Derive the file from the LIVE nginx config rather than assuming a path. A wrong
# path would silently create a second htpasswd file that nginx never reads — the
# reset would look successful while the old password stayed live.
HTFILE=$(sudo -n grep -rh auth_basic_user_file /etc/nginx/ 2>/dev/null \
  | head -1 | sed 's/.*auth_basic_user_file[[:space:]]*//; s/;.*//' | tr -d '[:space:]')
[ -n "${HTFILE:-}" ] || fail "no auth_basic_user_file directive found in /etc/nginx"
sudo -n test -f "$HTFILE" || fail "nginx points at $HTFILE but it does not exist"

BACKUP="${HTFILE}.bak-$(date +%Y%m%d-%H%M%S)"
sudo -n cp "$HTFILE" "$BACKUP" || fail "could not back up $HTFILE; nothing written"

# -i reads the password from stdin, -B forces bcrypt.
printf '%s' "$PW" | sudo -n htpasswd -i -B "$HTFILE" elena >/dev/null 2>&1 \
  || { sudo -n cp "$BACKUP" "$HTFILE"; fail "htpasswd rejected the write; rolled back"; }

# --- Verify against the live endpoint, not against the file. -----------------
OPS_URL="https://webhook.aideazz.xyz/ops/"

# 1. The new credential must actually open it.
AUTHED=$(curl -s -o /dev/null -w '%{http_code}' -u "elena:${PW}" "$OPS_URL" || echo 000)
# 2. And an anonymous request must still be refused. A 200 here would mean the
#    reset removed the lock instead of changing it — invisible from a browser
#    that is already authenticated, which is why it is checked explicitly.
ANON=$(curl -s -o /dev/null -w '%{http_code}' "$OPS_URL" || echo 000)

if [ "$AUTHED" = "200" ] && [ "$ANON" = "401" ]; then
  echo "OK: password reset for elena. Dashboard 200 with the new password, 401 without it. Backup: $(basename "$BACKUP")"
  exit 0
fi

sudo -n cp "$BACKUP" "$HTFILE"
fail "verification failed (authed=$AUTHED, anon=$ANON). Rolled back to the previous password; nothing changed."
