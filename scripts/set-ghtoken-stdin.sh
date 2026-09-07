#!/usr/bin/env bash
# set-ghtoken-stdin.sh — accept a GitHub token on STDIN, PROVE it works, then write it
# to BOTH places that need it, and restart the process that caches it.
#
# Same contract as set-pplx-stdin.sh and set-gmail-stdin.sh, for the same reason: Elena
# is usually on her phone with no terminal, and a token pasted into a chat is a token
# that has to be rotated. The value arrives on STDIN and never touches argv, so it
# cannot appear in `ps`. The Authorization header goes through curl --config on stdin
# for the same reason.
#
# TWO destinations, and this is the whole point (learned 7 Sep 2026):
#   1. ~/.git-credentials  — how git authenticates for push/pull/ls-remote.
#   2. cto-aipa/.env       — GITHUB_TOKEN, read by seven compiled modules for GitHub
#                            API calls (podcast-publish, blog-static-pages,
#                            fresh-leads-ingest, cto-aipa, telegram-bot).
# Rotating only the wallet leaves those modules on a dead value. git keeps working, so
# nothing looks wrong, and the API callers 401 into a log nobody reads. Silent failure.
#
# Pass the literal word "sync" instead of a token to re-copy the wallet's existing token
# into .env without rotating anything.
#
# Nothing is written unless GitHub accepts the token AND every repo that pushes from
# this box still authenticates. If any repo fails, the old wallet is RESTORED.
set -uo pipefail

CRED=/home/ubuntu/.git-credentials
ENV_FILE=/home/ubuntu/cto-aipa/.env
BAK="/home/ubuntu/_session-backups/git-credentials.$(date -u +%Y%m%d-%H%M%S)"
GH_USER=ElenaRevicheva
GH_HOST=github.com

REPOS="/home/ubuntu/cto-aipa /home/ubuntu/aideazz /home/ubuntu/whitespace/data
/home/ubuntu/VibeJobHunterAIPA_AIMCF /home/ubuntu/EspaLuzWhatsApp
/home/ubuntu/EspaLuzFamilybot /home/ubuntu/EspaLuz_Influencer"

read -r TOK || true
TOK="$(printf '%s' "${TOK:-}" | tr -d '[:space:]')"
[ -n "$TOK" ] || { echo "ERR: empty token on stdin"; exit 0; }

SYNC_ONLY=0
if [ "$TOK" = "sync" ]; then
  SYNC_ONLY=1
  TOK="$(sed -E 's#.*://[^:]+:([^@]+)@.*#\1#' "$CRED" 2>/dev/null | head -1)"
  [ -n "$TOK" ] || { echo "ERR: nothing in the wallet to sync from"; exit 0; }
fi

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

# --- 1. the wallet ----------------------------------------------------------
mkdir -p "$(dirname "$BAK")"
[ -f "$CRED" ] && cp -p "$CRED" "$BAK"

umask 177
if [ "$SYNC_ONLY" -eq 0 ]; then
  printf 'https://%s:%s@%s\n' "$GH_USER" "$TOK" "$GH_HOST" > "$CRED"
  chmod 600 "$CRED"
fi

# --- 2. .env, so the API callers do not drift onto a dead token --------------
ENV_STATE="not found"
if [ -f "$ENV_FILE" ]; then
  cp -p "$ENV_FILE" "$ENV_FILE.bak-ghtoken-$(date -u +%Y%m%d-%H%M%S)"
  ENV_TMP="$(mktemp)"
  grep -v '^GITHUB_TOKEN=' "$ENV_FILE" > "$ENV_TMP" || true
  printf 'GITHUB_TOKEN=%s\n' "$TOK" >> "$ENV_TMP"
  cat "$ENV_TMP" > "$ENV_FILE"
  rm -f "$ENV_TMP"
  chmod 600 "$ENV_FILE"
  ENV_STATE="updated"
fi
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
  *repo*) case "$SCOPES" in *workflow*) : ;; *) CHECK="WARNING: no 'workflow' scope — pushes touching .github/workflows will FAIL" ;; esac ;;
  *) CHECK="WARNING: no 'repo' scope — private repos will fail" ;;
esac

# The API callers read the env pm2 handed them at spawn, so writing .env is not enough:
# the process needs --update-env. Detach and delay — this script is a CHILD of that
# process, and restarting inline would kill the bot before it could reply.
if [ "$ENV_STATE" = "updated" ]; then
  nohup setsid sh -c 'sleep 15; pm2 restart cto-aipa --update-env' >/dev/null 2>&1 &
  NOTE=" .env updated too; cto-aipa restarts in ~15s so the API callers pick it up."
else
  NOTE=" WARNING: .env not found — GitHub API callers may still hold a stale token."
fi

if [ "$SYNC_ONLY" -eq 1 ]; then
  echo "OK: .env re-synced from the wallet, ${OK_N}/${OK_N} repos authenticate. Expires: ${EXP:-never}.${NOTE}"
else
  echo "OK: token verified, wallet rewritten, ${OK_N}/${OK_N} repos authenticate. Expires: ${EXP:-never}. ${CHECK}.${NOTE}"
fi
