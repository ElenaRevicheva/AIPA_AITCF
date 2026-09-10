#!/usr/bin/env bash
# Fix VJH CMO → Make.com 3543445: public image URLs so Instagram/Buffer can fetch.
# Piped over SSH (mode=cmo-fix). Never prints secrets. Does NOT POST a promo.
set -uo pipefail

MODE="${1:-cmo-fix}"
DIR=/home/ubuntu/VibeJobHunterAIPA_AIMCF
WEBROOT=/var/www/influencer-images/cmo
PUBLIC_BASE=https://webhook.aideazz.xyz/influencer-images/cmo

redact() {
  sed -E \
    -e 's#https://hook\.[a-z0-9.-]*make\.com/[A-Za-z0-9_-]+#https://hook.make.com/[REDACTED]#g' \
    -e 's#(Bearer[[:space:]]+)[A-Za-z0-9._+/=-]{8,}#\1[REDACTED]#g' \
    -e 's#\b[0-9a-fA-F]{32,}\b#[REDACTED_HEX]#g' \
    -e 's#(bot)[0-9]+:[A-Za-z0-9_-]+#\1[REDACTED]#g'
}

echo "=== cmo-fix $(date -u +%Y-%m-%dT%H:%M:%SZ) mode=$MODE ==="
[ "$MODE" = "cmo-fix" ] || { echo "expected mode=cmo-fix"; exit 1; }
[ -d "$DIR" ] || { echo "FATAL: $DIR missing"; exit 1; }
[ -f "$DIR/src/notifications/linkedin_cmo_v4.py" ] || { echo "FATAL: linkedin_cmo_v4.py missing"; exit 1; }
[ -f /tmp/patch-cmo-make-images.py ] || { echo "FATAL: patcher not scp'd to /tmp"; exit 1; }

echo
echo "=== 0. one-deployer check ==="
for u in vibejobhunter vibejobhunter-web; do
  echo "$u ActiveEnterTimestamp=$(systemctl show "$u" -p ActiveEnterTimestamp --value)"
done
python3 /tmp/patch-cmo-make-images.py --self-check

echo
echo "=== 1. stage public CMO image tree (images only — never .env) ==="
sudo mkdir -p "$WEBROOT"
if [ -d "$DIR/assets" ]; then
  find "$DIR/assets" -maxdepth 1 -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' \) \
    -exec sudo cp -f {} "$WEBROOT/" \;
fi
find "$DIR" -maxdepth 1 -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' \) \
  -exec sudo cp -f {} "$WEBROOT/" \;
sudo chown -R www-data:www-data /var/www/influencer-images
sudo find "$WEBROOT" -type d -exec chmod 755 {} \;
sudo find "$WEBROOT" -type f -exec chmod 644 {} \;
echo "staged files:"
find "$WEBROOT" -type f | wc -l
ls -1 "$WEBROOT" | head -25

echo
echo "=== 2. patch CMO sources ==="
python3 /tmp/patch-cmo-make-images.py "$DIR"
python3 -c "import ast,pathlib; ast.parse(pathlib.Path('$DIR/src/notifications/linkedin_cmo_v4.py').read_text())"
echo "syntax ok"
python3 - <<'PY'
from pathlib import Path
src = Path("/home/ubuntu/VibeJobHunterAIPA_AIMCF/src/notifications/linkedin_cmo_v4.py").read_text()
assert "https://webhook.aideazz.xyz/influencer-images/cmo" in src
assert "raw.githubusercontent.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF/main/assets" not in src
print("patch contracts: PASS")
PY

echo
echo "=== 3. restart vibejobhunter (owns Telegram + CMO send) ==="
# web server does not own the bot; do not bounce it unless we touched it
sudo systemctl restart vibejobhunter
sleep 4
systemctl is-active vibejobhunter
systemctl show vibejobhunter -p ActiveEnterTimestamp -p MainPID -p SubState
journalctl -u vibejobhunter --since "20 seconds ago" --no-pager | redact | tail -20

echo
echo "=== 4. public image HTTP proof (the file Instagram 400'd on) ==="
for u in \
  "$PUBLIC_BASE/marketing_engine_architecture_1.png" \
  "$PUBLIC_BASE/marketing_engine_architecture.png" \
  "$PUBLIC_BASE/sprinter.jpg" \
  "$PUBLIC_BASE/image_1.png"
do
  code=$(curl -sS -o /dev/null -w "%{http_code} %{content_type} %{size_download}" --max-time 15 -L "$u" || echo "curl-fail")
  echo "$code  $u"
done

echo
echo "=== 5. Buffer-like probe of the public architecture png ==="
python3 - <<'PY'
import urllib.request, ssl
url = "https://webhook.aideazz.xyz/influencer-images/cmo/marketing_engine_architecture_1.png"
req = urllib.request.Request(url, method="GET", headers={"User-Agent": "AIdeazz-LinkedInCMO/1.0 (image preflight)"})
with urllib.request.urlopen(req, timeout=12, context=ssl.create_default_context()) as r:
    body = r.read(32)
    ctype = r.headers.get("Content-Type", "")
print("status ok, content-type=", ctype, "magic=", body[:8])
assert body[:8] == b"\x89PNG\r\n\x1a\n", body[:16]
print("probe: PASS (PNG magic, Buffer would accept)")
PY

echo
echo "=== 6. commit + push VibeJobHunterAIPA_AIMCF (code only) ==="
(
  cd "$DIR"
  git add src/notifications/linkedin_cmo_v4.py
  for f in scripts/patch_select_image.py scripts/fix_selected_image.py scripts/run_marketing_engine_four_image_test.py; do
    [ -f "$f" ] && git add "$f" || true
  done
  git status --porcelain | redact
  if git diff --cached --quiet; then
    echo "nothing to commit"
  else
    git commit -m "$(cat <<'EOF'
fix(cmo): public image URLs so Make.com/Instagram can fetch them

GitHub raw 404s now that this repo is private. CMO probed those URLs,
sent empty imageURL, and Instagram 400'd. Serve assets from
webhook.aideazz.xyz/influencer-images/cmo/.
EOF
)"
    echo "committed $(git log -1 --format='%h %s')"
    git push origin HEAD:main && echo "PUSH_OK" || echo "WARN: git push failed — live file is still patched; push later"
  fi
)

echo
echo "=== DONE cmo-fix ==="
echo "ELENA: scenario 3543445 is already ON. Tap the CMO LinkedIn/Instagram button once more."
echo "Do not click Make Run once — that replays the empty-image payload."
