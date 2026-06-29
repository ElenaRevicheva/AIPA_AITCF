#!/usr/bin/env bash
# Oracle VM — fix git pull for ALL canonical repos.
#
# GitHub deploy keys are ONE repo only (same pubkey → 422 "key is already in use").
# Fix: register ~/.ssh/id_ed25519_github.pub as a USER SSH key (all ElenaRevicheva repos),
# OR fall back to HTTPS + GITHUB_TOKEN credential store.
#
# Requires GITHUB_TOKEN in /home/ubuntu/cto-aipa/.env
set -eu

KEY="${HOME}/.ssh/id_ed25519_github"
PUB="${KEY}.pub"
TOKEN_FILE="/home/ubuntu/cto-aipa/.env"
USER_KEY_TITLE="oracle-vm-fleet-2026"

if [[ ! -f "$PUB" ]]; then
  ssh-keygen -t ed25519 -C 'oracle-vm-fleet' -f "$KEY" -N ''
fi

if ! grep -q 'Host github.com' "${HOME}/.ssh/config" 2>/dev/null; then
  cat >> "${HOME}/.ssh/config" <<'EOF'

Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_github
  IdentitiesOnly yes
EOF
  chmod 600 "${HOME}/.ssh/config"
fi

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "Missing $TOKEN_FILE"
  exit 1
fi

TOKEN=$(grep -m1 '^GITHUB_TOKEN=' "$TOKEN_FILE" | cut -d= -f2- | tr -d '\r')
if [[ -z "$TOKEN" ]]; then
  echo "GITHUB_TOKEN empty"
  exit 1
fi

PUBKEY=$(cat "$PUB")

register_user_ssh_key() {
  local existing
  existing=$(curl -sS -H "Authorization: token ${TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/user/keys" | grep -c "$USER_KEY_TITLE" || true)
  if [[ "$existing" != "0" ]]; then
    echo "User SSH key already registered: $USER_KEY_TITLE"
    return 0
  fi
  local payload http_code
  payload=$(python3 -c 'import json,sys; print(json.dumps({"title":sys.argv[1],"key":sys.argv[2]}))' \
    "$USER_KEY_TITLE" "$PUBKEY")
  http_code=$(curl -sS -o /tmp/user_key_resp.json -w "%{http_code}" -X POST \
    -H "Authorization: token ${TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/user/keys" \
    -d "$payload")
  if [[ "$http_code" == "201" ]]; then
    echo "Registered user SSH key: $USER_KEY_TITLE"
  elif [[ "$http_code" == "422" ]] && grep -q "key is already in use" /tmp/user_key_resp.json 2>/dev/null; then
    echo "SSH pubkey already on GitHub account (OK)"
  else
    echo "WARN: user key HTTP $http_code — $(head -c 180 /tmp/user_key_resp.json)"
    echo "Falling back to HTTPS credential store..."
    setup_https_credentials
  fi
}

setup_https_credentials() {
  git config --global credential.helper store
  printf 'https://x-access-token:%s@github.com\n' "$TOKEN" > "${HOME}/.git-credentials"
  chmod 600 "${HOME}/.git-credentials"
  echo "Configured HTTPS credential store (token from cto-aipa/.env)"
}

switch_repo_ssh() {
  local repo_slug="$1"
  local path="$2"
  if [[ ! -d "$path/.git" ]]; then
    echo "  skip (no git): $path"
    return 0
  fi
  local ssh_url="git@github.com:${repo_slug}.git"
  git -C "$path" remote set-url origin "$ssh_url"
  if git -C "$path" fetch origin main 2>&1 | tail -1; then
    echo "  fetch OK: $path"
  else
    echo "  SSH fetch failed — trying HTTPS for $path"
    git -C "$path" remote set-url origin "https://github.com/${repo_slug}.git"
    git -C "$path" fetch origin main 2>&1 | tail -1 || echo "  fetch FAILED: $path"
  fi
}

echo "== Register Oracle VM SSH key on GitHub user account =="
register_user_ssh_key

echo ""
echo "== GitHub SSH test =="
ssh -o StrictHostKeyChecking=accept-new -T git@github.com 2>&1 | head -1 || true

REPOS=(
  "ElenaRevicheva/EspaLuzWhatsApp:/home/ubuntu/EspaLuzWhatsApp"
  "ElenaRevicheva/EspaLuzFamilybot:/home/ubuntu/EspaLuzFamilybot"
  "ElenaRevicheva/EspaLuz_Influencer:/home/ubuntu/EspaLuz_Influencer"
  "ElenaRevicheva/dragontrade-agent:/home/ubuntu/dragontrade-agent"
  "ElenaRevicheva/VibeJobHunterAIPA_AIMCF:/home/ubuntu/VibeJobHunterAIPA_AIMCF"
  "ElenaRevicheva/openclaw-vibejob-shortlist:/home/ubuntu/openclaw-vibejob-shortlist"
  "ElenaRevicheva/AIPA_AITCF:/home/ubuntu/cto-aipa"
  "ElenaRevicheva/atlas-shifted:/home/ubuntu/whitespace"
)

echo ""
echo "== Switch remotes + fetch =="
for entry in "${REPOS[@]}"; do
  repo_slug="${entry%%:*}"
  path="${entry#*:}"
  echo "--- $repo_slug ---"
  switch_repo_ssh "$repo_slug" "$path" || true
done

echo ""
echo "DONE. Verify: cd /home/ubuntu/EspaLuzFamilybot && git fetch origin main"
