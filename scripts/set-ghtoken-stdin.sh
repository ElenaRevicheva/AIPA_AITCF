#!/usr/bin/env bash
# set-ghtoken-stdin.sh — accept a GitHub token on STDIN, PROVE it works, and only
# then write it to the credential wallet.
#
# Same contract as set-pplx-stdin.sh and set-gmail-stdin.sh, for the same reason:
# Elena is usually on her phone with no terminal, and a token pasted into a chat is
# a token that has to be rotated. The value arrives on STDIN and never touches argv,
# so it cannot appear in `ps`. The Authorization header is passed via curl --config
# on stdin for the same reason.
#
# Nothing is written unless GitHub accepts the token AND every repo that pushes from
# this box can still authenticate. If any repo fails, the old wallet is RESTORED --
# a wallet holding a token that 401s is worse than no change at all, because the
# daily blog push, wiki-ship and the Monday Atlas backup would fail silently.
set -uo pipefail

CRED=/home/ubuntu/.git-credentials
BAK="/home/ubuntu/_session-backups/git-credentials.$(date -u +%Y%m%d-%H%M%S)"
GH_USER=ElenaRevicheva
GH_HOST=github.com

REPOS="/home/ubuntu/cto-aipa /home/ubuntu/aideazz /home/ubuntu/whitespace/data
/home/ubuntu/VibeJobHunterAIPA_AIMCF /home/ubuntu/EspaLuzWhatsApp
/home/ubuntu/EspaLuzFamilybot /home/ubuntu/EspaLuz_Influencer"

read -r TOK || true
TOK="$(printf '%s' "${TOK:-}" | tr -d '[:space:]')"

if [ -z "$TOK" ]; then echo "ERR: empty token on stdin"; exit 0; fi
case "$TOK" in
  ghp_*|github_pat_*) : ;;
  *) echo "ERR: that does not look like a GitHub token (expected ghp_ or github_pat_)"; exit 0 ;;
esac

# --- probe before write -----------------------------------------------------
HDRS="$(printf 'header = "Authorization: Bearer %s"\n' "$TOK" | curl -sSI \
  --config - --max-time 30 "https://api.${GH_HOST}/user" || true)"
CODE="$(printf '%s' "$HDRS" | head -1 | awk '{print $2}')"

case "$CODE" in
  200) : ;;
  401|403) echo "ERR: GitHub rejected that token (HTTP $CODE). Nothing written."; exit 0 ;;
  "")      echo "ERR: could not reach GitHub from the box. Nothing written."; exit 0 ;;
  *)       echo "ERR: unexpected HTTP $CODE from GitHub. Nothing written."; exit 0 ;;
esac

EXP="$(printf '%s' "$HDRS" | grep -i '^github-authentication-token-expiration:' | cut -d' ' -f2- | tr -d '\r')"
SCOPES="$(printf '%s' "$HDRS" | grep -i '^x-oauth-scopes:' | cut -d' ' -f2- | tr -d '\r')"

# --- write ------------------------------------------------------------------
mkdir -p "$(dirname "$BAK")"
[ -f "$CRED" ] && cp -p "$CRED" "$BAK"

umask 177
printf 'https://%s:%s@%s\n' "$GH_USER" "$TOK" "$GH_HOST" > "$CRED"
chmod 600 "$CRED"
unset TOK

# --- verify every repo, or roll back ----------------------------------------
FAILED=""
for d in $REPOS; do
  [ -d "$d/.git" ] || continue
  git -C "$d" ls-remote --heads origin >/dev/null 2>&1 || FAILED="$FAILED $(basename "$d")"
done

if [ -n "$FAILED" ]; then
  if [ -f "$BAK" ]; then cp -p "$BAK" "$CRED"; chmod 600 "$CRED"; fi
  echo "ERR: token is valid but these repos could not authenticate:$FAILED — OLD TOKEN RESTORED, nothing lost. Check the token has the 'repo' scope."
  exit 0
fi

OK_N="$(for d in $REPOS; do [ -d "$d/.git" ] && echo x; done | wc -l | tr -d ' ')"
CHECK="repo+workflow present"
case "$SCOPES" in
  *repo*) case "$SCOPES" in *workflow*) : ;; *) CHECK="⚠️ no 'workflow' scope — pushes touching .github/workflows will FAIL" ;; esac ;;
  *) CHECK="⚠️ no 'repo' scope — private repos will fail" ;;
esac

echo "OK: token verified, wallet rewritten, ${OK_N}/${OK_N} repos authenticate. Expires: ${EXP:-never}. ${CHECK}"
