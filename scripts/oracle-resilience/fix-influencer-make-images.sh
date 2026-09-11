#!/usr/bin/env bash
# Fix EspaLuz Influencer → Make.com: public image URLs + Telegram no longer
# aborting the webhook. Piped over SSH (mode=fix). Never prints secrets.
set -uo pipefail

MODE="${1:-fix}"
DIR=/home/ubuntu/EspaLuz_Influencer
WEBROOT=/var/www/influencer-images
NGINX_SITE=/etc/nginx/sites-available/webhook
PUBLIC_BASE=https://webhook.aideazz.xyz/influencer-images

redact() {
  sed -E \
    -e 's#https://hook\.[a-z0-9.-]*make\.com/[A-Za-z0-9_-]+#https://hook.make.com/[REDACTED]#g' \
    -e 's#(Bearer[[:space:]]+)[A-Za-z0-9._+/=-]{8,}#\1[REDACTED]#g' \
    -e 's#\b[0-9a-fA-F]{32,}\b#[REDACTED_HEX]#g' \
    -e 's#(bot)[0-9]+:[A-Za-z0-9_-]+#\1[REDACTED]#g'
}

echo "=== influencer-fix $(date -u +%Y-%m-%dT%H:%M:%SZ) mode=$MODE ==="
[ "$MODE" = "fix" ] || { echo "expected mode=fix"; exit 1; }
[ -d "$DIR" ] || { echo "FATAL: $DIR missing"; exit 1; }
[ -f "$DIR/main.py" ] || { echo "FATAL: main.py missing"; exit 1; }
[ -f /tmp/patch-influencer-make-images.py ] || { echo "FATAL: patcher not scp'd to /tmp"; exit 1; }

echo
echo "=== 0. one-deployer check ==="
ACTIVE=$(systemctl show espaluz-influencer -p ActiveEnterTimestamp --value 2>/dev/null || true)
echo "ActiveEnterTimestamp=$ACTIVE"
python3 /tmp/patch-influencer-make-images.py --self-check

echo
echo "=== 1. stage public image tree (images only — never .env) ==="
sudo mkdir -p "$WEBROOT/marketing_engine_images"
# root-level jpgs/pngs used as odd-day / architecture assets
find "$DIR" -maxdepth 1 -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' \) \
  -exec sudo cp -f {} "$WEBROOT/" \;
if [ -d "$DIR/marketing_engine_images" ]; then
  find "$DIR/marketing_engine_images" -maxdepth 1 -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' \) \
    -exec sudo cp -f {} "$WEBROOT/marketing_engine_images/" \;
fi
sudo chown -R www-data:www-data "$WEBROOT"
sudo find "$WEBROOT" -type d -exec chmod 755 {} \;
sudo find "$WEBROOT" -type f -exec chmod 644 {} \;
echo "staged files:"
find "$WEBROOT" -type f | wc -l
ls "$WEBROOT/marketing_engine_images" | head -5
ls "$WEBROOT" | head -15

echo
echo "=== 2. nginx location /influencer-images/ ==="
if sudo grep -q "location /influencer-images/" "$NGINX_SITE" 2>/dev/null; then
  echo "nginx location already present"
else
  BAK="${NGINX_SITE}.bak.influencer-images-$(date -u +%Y%m%d%H%M%S)"
  sudo cp "$NGINX_SITE" "$BAK"
  echo "backup $BAK"
  sudo cat "$NGINX_SITE" > /tmp/webhook.nginx.old
  python3 - <<'PY'
from pathlib import Path
src = Path("/tmp/webhook.nginx.old").read_text(encoding="utf-8")
block = '''
    # Promo images for Make.com/Buffer. EspaLuz_Influencer GitHub is private,
    # so raw.githubusercontent.com 404s and Buffer refuses the payload.
    location /influencer-images/ {
        alias /var/www/influencer-images/;
        autoindex off;
        add_header Cache-Control "public, max-age=86400";
        add_header X-Content-Type-Options nosniff;
        types {
            image/jpeg jpg jpeg;
            image/png png;
            image/webp webp;
        }
    }

'''
needle = "    location / {"
idx = src.find(needle)
if idx < 0:
    raise SystemExit("could not find 'location / {' in nginx webhook site")
out = src[:idx] + block + src[idx:]
Path("/tmp/webhook.nginx.new").write_text(out, encoding="utf-8")
print("wrote /tmp/webhook.nginx.new")
PY
  sudo cp /tmp/webhook.nginx.new "$NGINX_SITE"
  if sudo nginx -t; then
    sudo systemctl reload nginx
    echo "nginx reloaded with /influencer-images/"
  else
    echo "nginx -t FAILED — restoring backup"
    sudo cp "$BAK" "$NGINX_SITE"
    sudo nginx -t
    exit 1
  fi
fi

echo
echo "=== 3. patch main.py ==="
python3 /tmp/patch-influencer-make-images.py "$DIR/main.py"
python3 -c "import ast,pathlib; ast.parse(pathlib.Path('$DIR/main.py').read_text())"
echo "syntax ok"
# prove the three contracts
python3 - <<'PY'
from pathlib import Path
src = Path("/home/ubuntu/EspaLuz_Influencer/main.py").read_text()
assert "https://webhook.aideazz.xyz/influencer-images/" in src
assert "raw.githubusercontent.com/ElenaRevicheva/EspaLuz_Influencer" not in src
assert "marketing_engine_images" in src
assert "Make webhook still fires" in src
print("patch contracts: PASS")
PY

echo
echo "=== 4. local path resolver smoke ==="
python3 - <<'PY'
import os, sys
sys.path.insert(0, "/home/ubuntu/EspaLuz_Influencer")
os.chdir("/home/ubuntu/EspaLuz_Influencer")
# Importing main.py starts the bot. Don't. Exec just the function.
ns = {}
code = open("/home/ubuntu/EspaLuz_Influencer/main.py", encoding="utf-8").read()
# Pull only the function via regex exec is messy; call it by loading after
# compiling the function text.
import re, pathlib
src = pathlib.Path("/home/ubuntu/EspaLuz_Influencer/main.py").read_text()
m = re.search(r"^def _local_repo_image_path\(.*?(?=^def )", src, re.M | re.S)
assert m, "function missing after patch"
fn_src = "import os\nfrom typing import Optional\n" + m.group(0)
exec(fn_src, ns)
got = ns["_local_repo_image_path"]("https://webhook.aideazz.xyz/influencer-images/marketing_engine_images/me_29.jpg")
print("me_29.jpg →", got)
assert got and os.path.isfile(got), got
print("local resolver: PASS")
PY

echo
echo "=== 5. commit + push EspaLuz_Influencer (code only) ==="
(
  cd "$DIR"
  git add main.py
  git status --porcelain | redact
  if git diff --cached --quiet; then
    echo "nothing to commit (already on disk as committed?)"
  else
    git commit -m "$(cat <<'EOF'
fix(influencer): public image URLs so Make.com/Buffer can fetch them

GitHub raw 404s now that this repo is private. Telegram send_photo was
throwing before the Make webhook POST, so Buffer never ran. Serve images
from webhook.aideazz.xyz, resolve me_* files on disk, and keep a Telegram
photo failure from aborting the webhook.
EOF
)"
    echo "committed $(git log -1 --format='%h %s')"
    git push origin HEAD:main && echo "PUSH_OK" || echo "WARN: git push failed — live file is still patched; push later"
  fi
)

echo
echo "=== 6. restart espaluz-influencer ==="
sudo systemctl restart espaluz-influencer
sleep 3
systemctl is-active espaluz-influencer
systemctl show espaluz-influencer -p ActiveEnterTimestamp -p MainPID -p SubState
journalctl -u espaluz-influencer --since "30 seconds ago" --no-pager | redact | tail -30

echo
echo "=== 7. public image HTTP proof ==="
for u in \
  "$PUBLIC_BASE/marketing_engine_images/me_29.jpg" \
  "$PUBLIC_BASE/marketing_engine_architecture.png" \
  "$PUBLIC_BASE/image1.jpg"
do
  code=$(curl -sS -o /dev/null -w "%{http_code} %{content_type} %{size_download}" --max-time 15 -L "$u" || echo "curl-fail")
  echo "$code  $u"
done

echo
echo "=== 8. Make webhook reachable (HEAD/OPTIONS — no payload, no Buffer post) ==="
# Do NOT POST a promo. A live scenario would publish. Just confirm DNS/TLS.
python3 - <<'PY'
import os, re, urllib.request, ssl
from pathlib import Path
text = Path("/home/ubuntu/EspaLuz_Influencer/.env").read_text()
m = re.search(r"^MAKE_WEBHOOK_URL=(.+)$", text, re.M)
url = (m.group(1).strip().strip('"').strip("'") if m else "")
print("MAKE_WEBHOOK_URL set:", bool(url), "len:", len(url), "host:", url.split("/")[2] if url.startswith("http") else "?")
if url:
    try:
        req = urllib.request.Request(url, method="GET", headers={"User-Agent": "influencer-fix/1.0"})
        with urllib.request.urlopen(req, timeout=15, context=ssl.create_default_context()) as r:
            print("GET webhook status:", r.status, "(body omitted)")
    except Exception as e:
        # 410/404 when scenario is OFF is expected and useful.
        print("GET webhook result:", type(e).__name__, str(e)[:180])
PY

echo
echo "=== DONE influencer-fix ==="
echo "ELENA: turn ON Make scenario 3044021 (Immediately as data arrives), then send /daily_promo once."
echo "Do not click Run once first — that waits for a webhook you already sent."
