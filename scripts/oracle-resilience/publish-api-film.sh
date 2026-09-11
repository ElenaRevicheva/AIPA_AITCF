#!/usr/bin/env bash
# Publish a runner-built /api film. Does not compile. Does not restart services.
set -uo pipefail
SRC=/tmp/api-film-out
PUBLISH=/var/www/influencer-images/youtube
PUBLIC=https://webhook.aideazz.xyz/influencer-images/youtube

echo "=== api-film-publish $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
[ -f "$SRC/can-ai-find-and-cite-you-v12.mp4" ] || { echo "FATAL: $SRC/can-ai-find-and-cite-you-v12.mp4 missing"; exit 1; }
sudo mkdir -p "$PUBLISH"
sudo cp -f "$SRC/"*.mp4 "$PUBLISH/" 2>/dev/null || true
sudo cp -f "$SRC/"*.jpg "$PUBLISH/" 2>/dev/null || true
sudo cp -f "$SRC/"*.png "$PUBLISH/" 2>/dev/null || true
if [ -f "$SRC/watch.html" ]; then
  sudo cp -f "$SRC/watch.html" "$PUBLISH/watch.html"
fi
sudo chown -R www-data:www-data /var/www/influencer-images
sudo find "$PUBLISH" -type d -exec chmod 755 {} \;
sudo find "$PUBLISH" -type f -exec chmod 644 {} \;
ls -lh "$PUBLISH"
set +e
for u in \
  "$PUBLIC/can-ai-find-and-cite-you-v12.mp4" \
  "$PUBLIC/watch.html" \
  "$PUBLIC/api-cta-qr.png"
do
  code=$(curl -sS -o /dev/null -w "%{http_code} %{content_type} %{size_download}" --max-time 20 -L "$u" || echo "curl-fail")
  echo "$code  $u"
done
DUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$PUBLISH/can-ai-find-and-cite-you-v12.mp4" || echo 0)
printf 'v12-duration=%s\n' "$DUR"
awk -v d="$DUR" 'BEGIN { if (d+0 < 90) { print "FATAL: published v12 shorter than 90s"; exit 1 } }'
echo "DONE api-film-publish"
echo "ELENA: watch ${PUBLIC}/can-ai-find-and-cite-you-v12.mp4"
printf 'or %s/watch.html\n' "$PUBLIC"
