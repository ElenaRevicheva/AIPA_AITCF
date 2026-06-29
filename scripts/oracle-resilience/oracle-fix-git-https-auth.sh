#!/usr/bin/env bash
# Oracle VM — configure git HTTPS auth with GITHUB_TOKEN (pass as arg or env TOKEN).
# Usage: bash oracle-fix-git-https-auth.sh
#    or: TOKEN=ghp_xxx bash oracle-fix-git-https-auth.sh
set -eu

TOKEN="${1:-${TOKEN:-}}"
if [[ -z "$TOKEN" ]]; then
  TOKEN=$(grep -m1 '^GITHUB_TOKEN=' /home/ubuntu/cto-aipa/.env 2>/dev/null | cut -d= -f2- | tr -d '\r' || true)
fi
if [[ -z "$TOKEN" ]]; then
  echo "Usage: TOKEN=ghp_xxx bash $0   OR   bash $0 ghp_xxx"
  exit 1
fi

python3 - <<PY
import os, re, pathlib
token = os.environ["TOKEN"]
env = pathlib.Path("/home/ubuntu/cto-aipa/.env")
text = env.read_text()
if re.search(r"^GITHUB_TOKEN=", text, re.M):
    text = re.sub(r"^GITHUB_TOKEN=.*$", f"GITHUB_TOKEN={token}", text, count=1, flags=re.M)
else:
    text = text.rstrip() + f"\nGITHUB_TOKEN={token}\n"
env.write_text(text)
cred = pathlib.Path("/home/ubuntu/.git-credentials")
cred.write_text(f"https://x-access-token:{token}@github.com\n")
cred.chmod(0o600)
print("Updated cto-aipa/.env GITHUB_TOKEN and ~/.git-credentials")
PY

export TOKEN
git config --global credential.helper store
git config --global --unset-all "url.https://x-access-token@github.com/.insteadof" 2>/dev/null || true
git config --global "url.https://x-access-token:${TOKEN}@github.com/.insteadOf" "https://github.com/"

REPOS=(
  "ElenaRevicheva/EspaLuzFamilybot:/home/ubuntu/EspaLuzFamilybot"
  "ElenaRevicheva/EspaLuzWhatsApp:/home/ubuntu/EspaLuzWhatsApp"
  "ElenaRevicheva/EspaLuz_Influencer:/home/ubuntu/EspaLuz_Influencer"
  "ElenaRevicheva/VibeJobHunterAIPA_AIMCF:/home/ubuntu/VibeJobHunterAIPA_AIMCF"
  "ElenaRevicheva/AIPA_AITCF:/home/ubuntu/cto-aipa"
  "ElenaRevicheva/dragontrade-agent:/home/ubuntu/dragontrade-agent"
)

for entry in "${REPOS[@]}"; do
  slug="${entry%%:*}"
  path="${entry#*:}"
  [[ -d "$path/.git" ]] || continue
  git -C "$path" remote set-url origin "https://github.com/${slug}.git"
  echo "--- fetch $slug ---"
  git -C "$path" fetch origin main 2>&1 | tail -2 || true
done

echo ""
echo "Verify:"
git -C /home/ubuntu/EspaLuzFamilybot rev-parse --short HEAD origin/main 2>/dev/null || echo "Familybot: no origin/main"
git -C /home/ubuntu/EspaLuzWhatsApp rev-parse --short HEAD origin/main 2>/dev/null || echo "WhatsApp: no origin/main"
