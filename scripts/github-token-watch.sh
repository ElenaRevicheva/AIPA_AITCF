#!/usr/bin/env bash
# GitHub token expiry watch.
#
# Why this exists: on 7 Sep 2026 the "CTO AIPA" token was two days from expiry and
# nothing on this box would have said so. When it dies, the daily blog push, wiki-ship
# and the weekly Atlas backup all fail into a log file nobody reads -- the jobs still run,
# still look green, and simply stop producing output. Silent failure.
#
# The token lives in exactly one place: ~/.git-credentials (credential.helper=store).
# This script reads it there, asks GitHub when it expires, and shouts on Telegram while
# there is still time to act.
#
# The alarm checks its own delivery. curl exiting 0 is not proof Telegram accepted the
# message -- an alarm that cannot prove it was heard is the failure it exists to catch.
#
# Exit codes: 0 fine, 1 warning sent, 2 token dead/unreadable, 3 alert undeliverable.
set -uo pipefail
export PATH=/usr/local/bin:/usr/bin:/bin

CRED="${HOME:-/home/ubuntu}/.git-credentials"
ENV_FILE=/home/ubuntu/cto-aipa/.env
WARN_DAYS="${WARN_DAYS:-14}"
LOG=/home/ubuntu/logs/github-token-watch.log

mkdir -p "$(dirname "$LOG")"
stamp() { date -u +%FT%TZ; }
say() { echo "$(stamp) $*" >> "$LOG"; }

# Returns 0 only when Telegram itself confirms "ok":true.
tg() {
  local msg="$1" bot chat resp mid
  bot=$(grep -m1 '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '\r')
  chat=$(grep -m1 '^TELEGRAM_LEADS_DIGEST_CHAT_ID=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '\r')
  if [ -z "$bot" ] || [ -z "$chat" ]; then
    say "DELIVERY FAILED (no telegram config in $ENV_FILE)"; return 1
  fi
  resp=$(curl -s --max-time 20 -X POST "https://api.telegram.org/bot${bot}/sendMessage" \
    -d chat_id="${chat}" -d parse_mode=HTML -d text="$msg")
  if printf '%s' "$resp" | grep -q '"ok":true'; then
    mid=$(printf '%s' "$resp" | grep -o '"message_id":[0-9]*' | head -1 | cut -d: -f2)
    say "delivered (message_id ${mid:-?})"
    return 0
  fi
  say "DELIVERY FAILED: telegram said $(printf '%s' "$resp" | head -c 200)"
  return 1
}

DELIVERED=1

if [ ! -r "$CRED" ]; then
  tg "🔴 <b>GitHub token</b>%0A~/.git-credentials is missing or unreadable on Oracle. Every git push from this box is about to fail." && DELIVERED=0
  say "FATAL: no credential file"
  [ "$DELIVERED" -eq 0 ] && exit 2 || exit 3
fi

TOKEN=$(sed -E 's#.*://[^:]+:([^@]+)@.*#\1#' "$CRED" | head -1)
if [ -z "$TOKEN" ]; then
  tg "🔴 <b>GitHub token</b>%0ACould not parse a token out of ~/.git-credentials on Oracle." && DELIVERED=0
  say "FATAL: unparseable credential file"
  [ "$DELIVERED" -eq 0 ] && exit 2 || exit 3
fi

HDRS=$(curl -sI --max-time 20 -H "Authorization: Bearer ${TOKEN}" https://api.github.com/user)
unset TOKEN
CODE=$(printf '%s' "$HDRS" | head -1 | awk '{print $2}')

if [ "$CODE" != "200" ]; then
  tg "🔴 <b>GitHub token is DEAD</b> (HTTP ${CODE:-none})%0AThe daily blog push, wiki-ship and the weekly Atlas backup will fail silently.%0AFix: regenerate at github.com/settings/tokens, then put it in ONE place — ~/.git-credentials on Oracle." && DELIVERED=0
  say "DEAD: HTTP ${CODE:-none}"
  [ "$DELIVERED" -eq 0 ] && exit 2 || exit 3
fi

EXP=$(printf '%s' "$HDRS" | grep -i '^github-authentication-token-expiration:' | cut -d' ' -f2- | tr -d '\r')
if [ -z "$EXP" ]; then
  say "OK: token valid, no expiry set (never expires)"; exit 0
fi

EXP_TS=$(date -u -d "$(printf '%s' "$EXP" | sed 's/ UTC$//') UTC" +%s 2>/dev/null || echo 0)
NOW_TS=$(date -u +%s)
if [ "$EXP_TS" -le 0 ]; then
  say "WARN: could not parse expiry [$EXP]"; exit 0
fi
DAYS=$(( (EXP_TS - NOW_TS) / 86400 ))

if [ "$DAYS" -le "$WARN_DAYS" ]; then
  tg "⚠️ <b>GitHub token expires in ${DAYS} day(s)</b> — ${EXP}%0AWhen it dies: daily blog push, wiki-ship (21:30 UTC) and the Monday Atlas backup all stop, quietly.%0AIt lives in ONE place: <code>~/.git-credentials</code> on Oracle. Regenerate at github.com/settings/tokens and replace that one line.%0AScopes actually needed: <code>repo</code> + <code>workflow</code>." && DELIVERED=0
  say "WARN: ${DAYS} days left (${EXP})"
  [ "$DELIVERED" -eq 0 ] && exit 1 || exit 3
fi

say "OK: ${DAYS} days left (${EXP})"
exit 0
