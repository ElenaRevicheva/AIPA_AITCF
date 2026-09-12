#!/usr/bin/env bash
# Publish v14 only. Does not compile. Does not restart services.
# Does not overwrite v13 / v12 / the unversioned mp4.
set -uo pipefail
SRC=/tmp/api-film-out-v14
PUBLISH=/var/www/influencer-images/youtube
PUBLIC=https://webhook.aideazz.xyz/influencer-images/youtube

echo "=== api-film-publish-v14 $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
[ -f "$SRC/can-ai-find-and-cite-you-v14.mp4" ] || { echo "FATAL: $SRC/can-ai-find-and-cite-you-v14.mp4 missing"; exit 1; }
sudo mkdir -p "$PUBLISH"
# Named files only — never sudo cp *.mp4
sudo cp -f "$SRC/can-ai-find-and-cite-you-v14.mp4" "$PUBLISH/can-ai-find-and-cite-you-v14.mp4"
if [ -f "$SRC/can-ai-find-and-cite-you-v14-poster.jpg" ]; then
  sudo cp -f "$SRC/can-ai-find-and-cite-you-v14-poster.jpg" "$PUBLISH/can-ai-find-and-cite-you-v14-poster.jpg"
fi
if [ -f "$SRC/api-cta-qr.png" ]; then
  sudo cp -f "$SRC/api-cta-qr.png" "$PUBLISH/api-cta-qr.png"
fi
if [ -f "$SRC/watch-v14.html" ]; then
  sudo cp -f "$SRC/watch-v14.html" "$PUBLISH/watch-v14.html"
  # Point the live player at v14 only after the file is on disk. v13 file stays.
  sudo cp -f "$SRC/watch-v14.html" "$PUBLISH/watch.html"
fi
sudo chown -R www-data:www-data /var/www/influencer-images
sudo find "$PUBLISH" -type d -exec chmod 755 {} \;
sudo find "$PUBLISH" -type f -exec chmod 644 {} \;
ls -lh "$PUBLISH" | sed -n '1,40p'
set +e
for u in \
  "$PUBLIC/can-ai-find-and-cite-you-v14.mp4" \
  "$PUBLIC/can-ai-find-and-cite-you-v13.mp4" \
  "$PUBLIC/watch.html" \
  "$PUBLIC/watch-v14.html"
do
  code=$(curl -sS -o /dev/null -w "%{http_code} %{content_type} %{size_download}" --max-time 20 -L "$u" || echo "curl-fail")
  echo "$code  $u"
done
DUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$PUBLISH/can-ai-find-and-cite-you-v14.mp4" || echo 0)
printf 'v14-duration=%s\n' "$DUR"
awk -v d="$DUR" 'BEGIN { if (d+0 < 90) { print "FATAL: published v14 shorter than 90s"; exit 1 } }'
# Prove v13 is still the previous bytes (file still exists).
[ -f "$PUBLISH/can-ai-find-and-cite-you-v13.mp4" ] || echo "WARN: v13 missing on disk — do not overwrite; it should still be there"
echo "DONE api-film-publish-v14"
echo "ELENA: watch ${PUBLIC}/can-ai-find-and-cite-you-v14.mp4"
printf 'v13 kept at %s/can-ai-find-and-cite-you-v13.mp4\n' "$PUBLIC"
echo "do not overwrite v13"
