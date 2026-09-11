#!/usr/bin/env bash
# Cache-bust the /api YouTube film. Does NOT recompile. Does NOT restart
# cto-aipa / influencer / VJH. May reload nginx after nginx -t.
set -uo pipefail

MODE="${1:-api-film-bust}"
PUBLISH=/var/www/influencer-images/youtube
PUBLIC=https://webhook.aideazz.xyz/influencer-images/youtube
STABLE=can-ai-find-and-cite-you.mp4
FRESH=can-ai-find-and-cite-you-v2.mp4
DATED=can-ai-find-and-cite-you-20260911.mp4
NGINX_SITE=/etc/nginx/sites-available/webhook
STAMP="$(date -u +%Y%m%d%H%M%S)"

redact() {
  sed -E \
    -e 's#https://hook\.[a-z0-9.-]*make\.com/[A-Za-z0-9_-]+#https://hook.make.com/[REDACTED]#g' \
    -e 's#(Bearer[[:space:]]+)[A-Za-z0-9._+/=-]{8,}#\1[REDACTED]#g'
}

echo "=== api-film-bust $(date -u +%Y-%m-%dT%H:%M:%SZ) mode=$MODE stamp=$STAMP ==="
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
echo "=== 1. copy to filenames browsers have never seen ==="
[ -f "$PUBLISH/$STABLE" ] || { echo "FATAL: $PUBLISH/$STABLE missing"; exit 1; }
for dest in "$FRESH" "$DATED"; do
  sudo cp -f "$PUBLISH/$STABLE" "$PUBLISH/$dest"
  sudo chown www-data:www-data "$PUBLISH/$dest"
  sudo chmod 644 "$PUBLISH/$dest"
done
ls -lh "$PUBLISH/$STABLE" "$PUBLISH/$FRESH" "$PUBLISH/$DATED"

echo
echo "=== 1b. proof frames (t=0 title, t=42 live /api, t=70 CTA) ==="
extract_frame() {
  local ss="$1" out="$2"
  ffmpeg -y -ss "$ss" -i "$PUBLISH/$STABLE" -frames:v 1 -q:v 3 "$out" </dev/null
  sudo chown www-data:www-data "$out"
  sudo chmod 644 "$out"
  ls -lh "$out"
}
extract_frame 0 "$PUBLISH/proof-t00-title.jpg"
extract_frame 42 "$PUBLISH/proof-t42-loom.jpg"
extract_frame 70 "$PUBLISH/proof-t70-cta.jpg"

echo
echo "=== 1c. watch.html (HTML is a different cache key than the mp4) ==="
WATCH_SRC=/tmp/youtube-api-audit-film/api-film-watch.html
if [ ! -f "$WATCH_SRC" ]; then
  WATCH_SRC=/tmp/api-film-watch.html
fi
if [ -f "$WATCH_SRC" ]; then
  sed "s/CACHEBUST/$STAMP/g" "$WATCH_SRC" | sudo tee "$PUBLISH/watch.html" >/dev/null
else
  sudo tee "$PUBLISH/watch.html" >/dev/null <<HTML
<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta http-equiv="Cache-Control" content="no-store">
<title>Can AI find and cite you? — /api promo</title>
</head><body style="background:#0b0b0b;color:#eee;font:16px/1.4 system-ui">
<p>Skip to 0:42 for the live /api walkthrough. First 40s are grapes on purpose.</p>
<video controls autoplay playsinline style="width:100%;max-width:1280px"
  src="can-ai-find-and-cite-you-v2.mp4?v=${STAMP}"></video>
</body></html>
HTML
fi
sudo chown www-data:www-data "$PUBLISH/watch.html"
sudo chmod 644 "$PUBLISH/watch.html"
ls -lh "$PUBLISH/watch.html"

echo
echo "=== 2. nginx: youtube/ must NOT inherit max-age=86400 ==="
echo "--- locations in $NGINX_SITE ---"
sudo grep -n "influencer-images" "$NGINX_SITE" | redact || true
BAK="${NGINX_SITE}.bak.youtube-nocache-$(date -u +%Y%m%d%H%M%S)"
sudo cp "$NGINX_SITE" "$BAK"
sudo cat "$NGINX_SITE" > /tmp/webhook.nginx.old
python3 - <<'PY'
from pathlib import Path
src = Path("/tmp/webhook.nginx.old").read_text(encoding="utf-8")
block = '''
    # YouTube promo mp4s change in place. Parent /influencer-images/ sends
    # Cache-Control max-age=86400 (24h). ^~ so this prefix wins over the parent.
    # no-store so shared caches (and Chrome) cannot keep a stale cut.
    location ^~ /influencer-images/youtube/ {
        alias /var/www/influencer-images/youtube/;
        autoindex off;
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;
        add_header Pragma "no-cache" always;
        add_header CDN-Cache-Control "no-store" always;
        add_header X-Content-Type-Options nosniff always;
        types {
            video/mp4 mp4;
            image/jpeg jpg jpeg;
            text/html html;
        }
        default_type video/mp4;
    }

'''
import re
src = re.sub(
    r"\n    location(?: \^~)? /influencer-images/youtube/ \{.*?\n    \}\n",
    "\n",
    src,
    flags=re.S,
)
needle = "    location /influencer-images/"
idx = src.find(needle)
if idx < 0:
    raise SystemExit("could not find location /influencer-images/ in nginx site")
Path("/tmp/webhook.nginx.new").write_text(src[:idx] + block + src[idx:], encoding="utf-8")
print("wrote /tmp/webhook.nginx.new")
print("youtube locations remaining before insert:", src[:idx].count("location"))
PY
sudo cp /tmp/webhook.nginx.new "$NGINX_SITE"
if sudo nginx -t; then
  sudo systemctl reload nginx
  echo "nginx reloaded — youtube/ is ^~ no-store"
else
  echo "nginx -t FAILED — restoring backup"
  sudo cp "$BAK" "$NGINX_SITE"
  sudo nginx -t
  exit 1
fi
echo "--- locations after ---"
sudo grep -n "influencer-images" "$NGINX_SITE" | redact || true

echo
echo "=== 3. public HEAD (Content-Length is the tell; dump cache/CDN headers) ==="
dump_headers() {
  local u="$1"
  echo "--- $u"
  curl -sS -I --max-time 20 -L "$u" | redact | grep -iE 'HTTP/|content-length|content-type|cache-control|pragma|expires|last-modified|etag|cf-|age:|via:|x-cache|server:' || echo "curl-fail"
}
for u in \
  "$PUBLIC/$STABLE" \
  "$PUBLIC/$FRESH" \
  "$PUBLIC/$DATED" \
  "$PUBLIC/watch.html" \
  "$PUBLIC/proof-t00-title.jpg" \
  "$PUBLIC/proof-t42-loom.jpg" \
  "$PUBLIC/proof-t70-cta.jpg"
do
  dump_headers "$u"
done

echo
echo "ELENA: the old filename is stuck in Chrome for up to 24h. Open ONE of these:"
echo "$PUBLIC/watch.html"
echo "$PUBLIC/$FRESH"
echo "$PUBLIC/$DATED"
echo "Incognito also works on the old filename. Skip to 0:42 for the live /api screen."
echo "=== DONE api-film-bust ==="
exit 0
