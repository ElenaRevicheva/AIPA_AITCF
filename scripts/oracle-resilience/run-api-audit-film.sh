#!/usr/bin/env bash
# Compile the /api YouTube film on Oracle using Atuona studio tools.
# Piped over SSH (mode=api-film). Does NOT restart cto-aipa / influencer / VJH.
# Does NOT POST a promo. Does NOT write into the Atuona poetry gallery.
set -uo pipefail

MODE="${1:-api-film}"
DIR=/home/ubuntu/aideazz-api-film
SRC=/tmp/youtube-api-audit-film
PUBLISH=/var/www/influencer-images/youtube
PUBLIC=https://webhook.aideazz.xyz/influencer-images/youtube

redact() {
  sed -E \
    -e 's#https://hook\.[a-z0-9.-]*make\.com/[A-Za-z0-9_-]+#https://hook.make.com/[REDACTED]#g' \
    -e 's#(Bearer[[:space:]]+)[A-Za-z0-9._+/=-]{8,}#\1[REDACTED]#g' \
    -e 's#\b[0-9a-fA-F]{32,}\b#[REDACTED_HEX]#g'
}

echo "=== api-film $(date -u +%Y-%m-%dT%H:%M:%SZ) mode=$MODE ==="
[ "$MODE" = "api-film" ] || { echo "expected mode=api-film"; exit 1; }
[ -d "$SRC" ] || { echo "FATAL: $SRC missing — scp the film kit first"; exit 1; }
[ -f "$SRC/compile.mjs" ] || { echo "FATAL: compile.mjs missing"; exit 1; }
command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null || { echo "FATAL: ffmpeg/ffprobe missing"; exit 1; }
command -v node >/dev/null || { echo "FATAL: node missing"; exit 1; }

echo
echo "=== 0. keys present (names only) ==="
ENVF=/home/ubuntu/cto-aipa/.env
[ -f "$ENVF" ] || { echo "FATAL: $ENVF missing"; exit 1; }
python3 - <<PY
from pathlib import Path
text = Path("/home/ubuntu/cto-aipa/.env").read_text()
for k in ("OPENAI_API_KEY","RUNWAY_API_KEY","LUMA_API_KEY","REPLICATE_API_TOKEN","SUNO_API_KEY"):
    ok = any(line.startswith(k+"=") and line.split("=",1)[1].strip() for line in text.splitlines())
    print(f"{k}: {'yes' if ok else 'NO'}")
PY

echo
echo "=== 1. stage work dir (outside the repo) ==="
mkdir -p "$DIR"/{work,vo,clips,kit,music}
rm -rf "$DIR/kit"
mkdir -p "$DIR/kit"
cp -a "$SRC"/. "$DIR/kit/"
ls -la "$DIR/kit" | head -20
ls "$DIR/kit/fruit"
ls "$DIR/kit/ui"
if [ ! -f "$DIR/kit/fetch-pixabay-music.py" ] && [ -f "$DIR/kit/youtube-api-audit-film/fetch-pixabay-music.py" ]; then
  echo "WARN: scp nested the kit — flattening"
  cp -a "$DIR/kit/youtube-api-audit-film/." "$DIR/kit/"
fi
[ -f "$DIR/kit/fetch-pixabay-music.py" ] || { echo "FATAL: fetch-pixabay-music.py missing in kit"; exit 1; }
[ -f "$DIR/kit/compile.mjs" ] || { echo "FATAL: compile.mjs missing in kit"; exit 1; }

echo
echo "=== 1a. Elena's muted Loom walkthrough ==="
mkdir -p "$DIR/loom"
if [ -f "$DIR/kit/loom/walkthrough.mp4" ]; then
  cp -f "$DIR/kit/loom/walkthrough.mp4" "$DIR/loom/walkthrough.mp4"
fi
if [ ! -f "$DIR/loom/walkthrough.mp4" ]; then
  python3 "$DIR/kit/fetch-loom.py" --out "$DIR/loom/walkthrough.mp4"
fi
[ -f "$DIR/loom/walkthrough.mp4" ] || { echo "FATAL: Loom walkthrough missing"; exit 1; }
export API_FILM_LOOM="$DIR/loom/walkthrough.mp4"
ls -lh "$API_FILM_LOOM"
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$API_FILM_LOOM" || true

echo
echo "=== 1b. Pixabay chillout-energy bed (Bright Data — FILM_COMPILATION_GUIDE §4) ==="
echo "Atuona poetry library (do NOT pick from here):"
ls /home/ubuntu/cto-aipa/data/atuona/films/music 2>/dev/null | redact || echo "(missing)"
export API_FILM_DIR="$DIR"
export API_FILM_PUBLISH="$DIR/out"
export API_FILM_MUSIC_DIR="$DIR/music"
export CTO_ENV="$ENVF"
set +e
python3 "$DIR/kit/fetch-pixabay-music.py"
MUSIC_RC=$?
set -e
if [ "$MUSIC_RC" -ne 0 ]; then
  echo "FATAL: Pixabay fetch failed rc=$MUSIC_RC"
  exit "$MUSIC_RC"
fi
if [ -f "$DIR/music/SELECTED.path" ]; then
  export API_FILM_MUSIC="$(head -n1 "$DIR/music/SELECTED.path" | tr -d '\r')"
  echo "API_FILM_MUSIC=$API_FILM_MUSIC"
fi

echo
echo "=== 2. compile (cached Runway/TTS + new music mix). No service restart. ==="
mkdir -p "$DIR/out"
# node compile reads keys itself; do not source .env (FROM_EMAIL has spaces)
set +e
node "$DIR/kit/compile.mjs"
RC=$?
set -e
echo "compile exit $RC"
echo "music used: ${API_FILM_MUSIC:-unset}"

echo
echo "=== 3. publish + probe ==="
sudo mkdir -p "$PUBLISH"
if ls "$DIR/out"/*.mp4 >/dev/null 2>&1; then
  sudo cp -f "$DIR/out"/*.mp4 "$DIR/out"/*.jpg "$PUBLISH/" 2>/dev/null || sudo cp -f "$DIR/out"/*.mp4 "$PUBLISH/"
fi
sudo chown -R www-data:www-data /var/www/influencer-images
sudo find "$PUBLISH" -type d -exec chmod 755 {} \;
sudo find "$PUBLISH" -type f -exec chmod 644 {} \;
ls -lh "$PUBLISH" | redact
for u in \
  "$PUBLIC/can-ai-find-and-cite-you.mp4" \
  "$PUBLIC/can-ai-find-and-cite-you-poster.jpg"
do
  code=$(curl -sS -o /dev/null -w "%{http_code} %{content_type} %{size_download}" --max-time 20 -L "$u" || echo "curl-fail")
  echo "$code  $u"
done
if [ -f "$PUBLISH/can-ai-find-and-cite-you.mp4" ]; then
  ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate,sample_rate \
    -of default=nw=1 "$PUBLISH/can-ai-find-and-cite-you.mp4" | redact
  ffmpeg -y -i "$PUBLISH/can-ai-find-and-cite-you.mp4" -frames:v 1 /tmp/api-film-frame0.jpg 2>/dev/null
  echo "frame0 bytes=$(wc -c < /tmp/api-film-frame0.jpg)"
fi

echo
echo "=== DONE api-film rc=$RC ==="
echo "ELENA: watch $PUBLIC/can-ai-find-and-cite-you.mp4"
echo "Do not drop this mp4 into Atuona /films — that gallery is poetry."
exit $RC
