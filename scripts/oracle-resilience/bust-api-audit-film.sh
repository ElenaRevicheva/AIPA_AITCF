#!/usr/bin/env bash
# Cache-bust the /api YouTube film. Does NOT recompile. Does NOT restart
# cto-aipa / influencer / VJH. May reload nginx after nginx -t.
set -uo pipefail

MODE="${1:-api-film-bust}"
PUBLISH=/var/www/influencer-images/youtube
PUBLIC=https://webhook.aideazz.xyz/influencer-images/youtube
STABLE=can-ai-find-and-cite-you.mp4
FRESH=can-ai-find-and-cite-you-v2.mp4
NGINX_SITE=/etc/nginx/sites-available/webhook

redact() {
  sed -E \
    -e 's#https://hook\.[a-z0-9.-]*make\.com/[A-Za-z0-9_-]+#https://hook.make.com/[REDACTED]#g' \
    -e 's#(Bearer[[:space:]]+)[A-Za-z0-9._+/=-]{8,}#\1[REDACTED]#g'
}

echo "=== api-film-bust $(date -u +%Y-%m-%dT%H:%M:%SZ) mode=$MODE ==="
[ "$MODE" = "api-film-bust" ] || { echo "expected mode=api-film-bust"; exit 1; }

echo
echo "=== 0. what is on disk ==="
ls -lh "$PUBLISH" | redact
python3 - <<'PY'
from pathlib import Path
p = Path("/var/www/influencer-images/youtube/can-ai-find-and-cite-you.mp4")
print(f"stable exists={p.exists()} bytes={p.stat().st_size if p.exists() else 0}")
PY

echo
echo "=== 1. copy to a new filename browsers have never seen ==="
[ -f "$PUBLISH/$STABLE" ] || { echo "FATAL: $PUBLISH/$STABLE missing"; exit 1; }
sudo cp -f "$PUBLISH/$STABLE" "$PUBLISH/$FRESH"
# also keep the stamped compile output if present
sudo chown www-data:www-data "$PUBLISH/$FRESH"
sudo chmod 644 "$PUBLISH/$FRESH"
ls -lh "$PUBLISH/$STABLE" "$PUBLISH/$FRESH"

echo
echo "=== 2. nginx: youtube/ must NOT inherit max-age=86400 ==="
if sudo grep -q "location /influencer-images/youtube/" "$NGINX_SITE" 2>/dev/null; then
  echo "youtube location already present"
else
  BAK="${NGINX_SITE}.bak.youtube-nocache-$(date -u +%Y%m%d%H%M%S)"
  sudo cp "$NGINX_SITE" "$BAK"
  echo "backup $BAK"
  sudo cat "$NGINX_SITE" > /tmp/webhook.nginx.old
  python3 - <<'PY'
from pathlib import Path
src = Path("/tmp/webhook.nginx.old").read_text(encoding="utf-8")
block = '''
    # YouTube promo mp4s change in place. The parent /influencer-images/
    # location sends Cache-Control max-age=86400, so a browser keeps the
    # previous cut for a full day. This location must win (more specific).
    location /influencer-images/youtube/ {
        alias /var/www/influencer-images/youtube/;
        autoindex off;
        add_header Cache-Control "no-cache, must-revalidate";
        add_header X-Content-Type-Options nosniff;
        types {
            video/mp4 mp4;
            image/jpeg jpg jpeg;
        }
        default_type video/mp4;
    }

'''
needle = "    location /influencer-images/"
idx = src.find(needle)
if idx < 0:
    raise SystemExit("could not find location /influencer-images/ in nginx site")
Path("/tmp/webhook.nginx.new").write_text(src[:idx] + block + src[idx:], encoding="utf-8")
print("wrote /tmp/webhook.nginx.new")
PY
  sudo cp /tmp/webhook.nginx.new "$NGINX_SITE"
  if sudo nginx -t; then
    sudo systemctl reload nginx
    echo "nginx reloaded — youtube/ is no-cache"
  else
    echo "nginx -t FAILED — restoring backup"
    sudo cp "$BAK" "$NGINX_SITE"
    sudo nginx -t
    exit 1
  fi
fi

echo
echo "=== 3. public HEAD (Content-Length is the tell) ==="
for u in \
  "$PUBLIC/$STABLE" \
  "$PUBLIC/$FRESH"
do
  echo "--- $u"
  curl -sS -I --max-time 20 -L "$u" | redact | grep -iE 'HTTP/|content-length|content-type|cache-control|last-modified|etag' || echo "curl-fail"
done

echo
echo "ELENA: open the NEW url (Chrome has the old one cached for up to 24h):"
echo "$PUBLIC/$FRESH"
echo "=== DONE api-film-bust ==="
exit 0
