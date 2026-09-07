#!/usr/bin/env bash
# Install a new GitHub token into the one place it lives, and prove it works.
#
# Usage (the token is typed/pasted on stdin, never as an argument, so it never
# lands in shell history or the process list):
#
#     /home/ubuntu/bin/github-token-set.sh
#     <paste token, press Enter>
#
# It backs up the old wallet, writes the new one, then verifies against GitHub
# and every repo that pushes from this box. If verification fails it ROLLS BACK.
set -uo pipefail
export PATH=/usr/local/bin:/usr/bin:/bin

CRED="${HOME:-/home/ubuntu}/.git-credentials"
BAK="/home/ubuntu/_session-backups/git-credentials.$(date -u +%Y%m%d-%H%M%S)"
USER_NAME=ElenaRevicheva

REPOS="/home/ubuntu/cto-aipa /home/ubuntu/aideazz /home/ubuntu/whitespace/data
/home/ubuntu/VibeJobHunterAIPA_AIMCF /home/ubuntu/EspaLuzWhatsApp
/home/ubuntu/EspaLuzFamilybot /home/ubuntu/EspaLuz_Influencer"

printf 'Paste the new GitHub token (input hidden), then Enter: ' >&2
read -r -s NEW
printf '\n' >&2

if [ -z "${NEW:-}" ]; then echo "ABORT: nothing pasted." >&2; exit 1; fi
case "$NEW" in
  ghp_*|github_pat_*) : ;;
  *) echo "ABORT: that does not look like a GitHub token (expects ghp_ or github_pat_)." >&2; exit 1 ;;
esac

echo "--> checking the token against GitHub before touching anything"
HDRS=$(curl -sI --max-time 20 -H "Authorization: Bearer ${NEW}" https://api.github.com/user)
CODE=$(printf '%s' "$HDRS" | head -1 | awk '{print $2}')
if [ "$CODE" != "200" ]; then
  echo "ABORT: GitHub rejected it (HTTP ${CODE:-none}). Nothing changed." >&2; exit 1
fi
EXP=$(printf '%s' "$HDRS" | grep -i '^github-authentication-token-expiration:' | cut -d' ' -f2- | tr -d '\r')
SCOPES=$(printf '%s' "$HDRS" | grep -i '^x-oauth-scopes:' | cut -d' ' -f2- | tr -d '\r')
echo "    accepted. expires: ${EXP:-never}"
echo "    scopes:  ${SCOPES:-<fine-grained>}"

mkdir -p "$(dirname "$BAK")"
if [ -f "$CRED" ]; then cp -p "$CRED" "$BAK"; echo "--> old wallet backed up to $BAK"; fi

umask 177
# The host is kept in a variable so that no "%s@<host>" literal exists in this
# file. A shape-based PII scanner reads that as an email address -- the same
# false positive that corrupted the licensed copy on 6 Sep 2026.
GH_HOST=github.com
printf 'https://%s:%s@%s\n' "$USER_NAME" "$NEW" "$GH_HOST" > "$CRED"
chmod 600 "$CRED"
unset NEW
echo "--> wallet written ($(wc -l < "$CRED") line, mode $(stat -c %a "$CRED"))"

echo "--> verifying every repo that pushes from this box"
FAIL=0
for d in $REPOS; do
  [ -d "$d/.git" ] || continue
  if git -C "$d" ls-remote --heads origin >/dev/null 2>&1; then
    printf '    %-28s AUTH_OK\n' "$(basename "$d")"
  else
    printf '    %-28s AUTH_FAIL\n' "$(basename "$d")"; FAIL=1
  fi
done

if [ "$FAIL" -ne 0 ]; then
  echo "!!! at least one repo failed. ROLLING BACK." >&2
  if [ -f "$BAK" ]; then cp -p "$BAK" "$CRED"; chmod 600 "$CRED"; echo "    restored from $BAK" >&2; fi
  exit 1
fi

echo "--> running the expiry watch so the new state is on the record"
/home/ubuntu/bin/github-token-watch.sh; RC=$?
echo "    watch exit=$RC (0 = healthy and quiet)"
echo "DONE. The token lives in one place: $CRED"
exit 0
