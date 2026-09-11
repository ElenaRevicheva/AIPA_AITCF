#!/usr/bin/env bash
# Compile the /api YouTube film on the GitHub-hosted runner (not Oracle).
# Oracle SSH died mid-xfade and then stopped accepting banners — do not encode there.
# Motion fruit is salvaged from the already-published v2/v5 cuts.
set -uo pipefail

KIT="${GITHUB_WORKSPACE:-/workspace}/scripts/youtube-api-audit-film"
DIR="${API_FILM_DIR:-${RUNNER_TEMP:-/tmp}/aideazz-api-film}"
PUBLIC=https://webhook.aideazz.xyz/influencer-images/youtube
export API_FILM_DIR="$DIR"
export API_FILM_PUBLISH="$DIR/out"
export API_FILM_MUSIC_DIR="$DIR/music"
export API_FILM_LOOM="$DIR/loom/walkthrough.mp4"
export API_FILM_CRAWLERS_SRC="$DIR/src/v2.mp4"
export API_FILM_CRAWLERS_SS=15.0
export API_FILM_CRAWLERS_T=7.0
export API_FILM_SPLIT_SRC="$DIR/src/v2.mp4"
unset API_FILM_FORCE_FRUIT

echo "=== runner-compile $(date -u +%Y-%m-%dT%H:%M:%SZ) dir=$DIR ==="
command -v ffmpeg && command -v ffprobe && command -v node || { echo FATAL: ffmpeg/node; exit 1; }
[ -f "$KIT/compile.mjs" ] || { echo "FATAL: $KIT/compile.mjs missing"; exit 1; }
[ -n "${OPENAI_API_KEY:-}" ] || { echo "FATAL: OPENAI_API_KEY missing on runner"; exit 1; }

mkdir -p "$DIR"/{src,clips,work,vo,out,music,loom,frames}
cd "$DIR"

echo
echo "=== 0. download published cuts for motion salvage ==="
for id in v2 v5; do
  url="$PUBLIC/can-ai-find-and-cite-you-${id}.mp4"
  echo "GET $url"
  curl -fsSL --retry 4 --retry-delay 4 --max-time 120 -o "src/${id}.mp4" "$url"
  ls -lh "src/${id}.mp4"
  ffprobe -v error -show_entries format=duration,size -of default=nw=1 "src/${id}.mp4"
done
[ "$(stat -c%s src/v2.mp4)" -gt 1000000 ] || { echo FATAL: v2 too small; exit 1; }
[ "$(stat -c%s src/v5.mp4)" -gt 1000000 ] || { echo FATAL: v5 too small; exit 1; }

echo
echo "=== 1. extract moving pomegranate + maracuya insects ==="
# v2 ss=4.6 is the pomegranate/title window (NOT grapes — Elena already rejected that label).
# v2 ss=15 is the walking glass crawlers (verified in Oracle v12 compile log).
# v5 after crawlers (~11s) is hand then dashboard.
ffmpeg -y -ss 4.6 -i src/v2.mp4 -t 7.0 -an -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p clips/split.mp4
ffmpeg -y -ss 15.0 -i src/v2.mp4 -t 7.0 -an -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p clips/crawlers.mp4
ffmpeg -y -ss 19.0 -i src/v5.mp4 -t 6.5 -an -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p clips/hand.mp4
ffmpeg -y -ss 26.0 -i src/v5.mp4 -t 8.0 -an -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p clips/dashboard.mp4
ls -lh clips
for c in split crawlers hand dashboard; do
  [ "$(stat -c%s "clips/${c}.mp4")" -gt 20000 ] || { echo "FATAL: $c extract empty"; exit 1; }
done

echo
echo "=== 1a. Elena Loom ==="
python3 "$KIT/fetch-loom.py" --force --out "$API_FILM_LOOM"
ls -lh "$API_FILM_LOOM"
ffprobe -v error -show_entries format=duration:stream=width,height -of default=nw=1 "$API_FILM_LOOM"

echo
echo "=== 1c. music (Pixabay may fail without Bright Data — compile will drone) ==="
set +e
python3 "$KIT/fetch-pixabay-music.py"
echo "pixabay rc=$?"
set -e
if [ -f "$DIR/music/SELECTED.path" ]; then
  export API_FILM_MUSIC="$(head -n1 "$DIR/music/SELECTED.path" | tr -d '\r')"
  echo "API_FILM_MUSIC=$API_FILM_MUSIC"
fi

echo
echo "=== 2. compile on runner ==="
# compile.mjs lives next to fruit/ ui/ qr/
set +e
node "$KIT/compile.mjs"
RC=$?
set -e
echo "compile exit $RC"
ls -lh "$DIR/out" || true
if [ ! -f "$DIR/out/can-ai-find-and-cite-you-v12.mp4" ]; then
  echo FATAL: v12 missing
  exit 1
fi
DUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$DIR/out/can-ai-find-and-cite-you-v12.mp4" || echo 0)
echo "v12-duration=$DUR"
awk -v d="$DUR" 'BEGIN { if (d+0 < 90) { print "FATAL: v12 shorter than 90s — stub"; exit 1 } }'

ffmpeg -y -ss 7 -i "$DIR/out/can-ai-find-and-cite-you-v12.mp4" -frames:v 1 -update 1 "$DIR/frames/grapes.jpg"
ffmpeg -y -ss 22 -i "$DIR/out/can-ai-find-and-cite-you-v12.mp4" -frames:v 1 -update 1 "$DIR/frames/crawlers.jpg"
ffmpeg -y -ss 48 -i "$DIR/out/can-ai-find-and-cite-you-v12.mp4" -frames:v 1 -update 1 "$DIR/frames/loom.jpg"
ls -lh "$DIR/frames"

STAMP=$(date -u +%Y%m%d%H%M%S)
if [ -f "$KIT/../oracle-resilience/api-film-watch.html" ]; then
  sed "s/CACHEBUST/$STAMP/g" "$KIT/../oracle-resilience/api-film-watch.html" > "$DIR/out/watch.html"
fi
echo "RUNNER_OK dur=$DUR rc=$RC"
exit "$RC"
