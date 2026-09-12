#!/usr/bin/env bash
# Fresh /api YouTube film v15 on Oracle (or a GH runner with the same keys).
# /api hero language (whole→cut + field). DeepSeek Flash directs; Seedance
# shoots when credited; otherwise hero-clip-v15 (NOT Ken Burns).
# Does NOT restart cto-aipa / influencer / VJH.
# Does NOT write v14, v13, v12, or the unversioned mp4.
set -uo pipefail

KIT="${GITHUB_WORKSPACE:-/workspace}/scripts/youtube-api-audit-film"
if [ -d /tmp/youtube-api-audit-film-v15 ] && [ -f /tmp/youtube-api-audit-film-v15/compile-v15.mjs ]; then
  KIT=/tmp/youtube-api-audit-film-v15
fi
DIR="${API_FILM_DIR:-/home/ubuntu/aideazz-api-film-v15}"
if [ -n "${RUNNER_TEMP:-}" ] && [ ! -d /home/ubuntu/cto-aipa ]; then
  DIR="${API_FILM_DIR:-${RUNNER_TEMP}/aideazz-api-film-v15}"
fi
export API_FILM_DIR="$DIR"
export API_FILM_PUBLISH="${API_FILM_PUBLISH:-$DIR/out}"
export API_FILM_MUSIC_DIR="$DIR/music"
export API_FILM_CUT=v15
export CTO_ENV="${CTO_ENV:-/home/ubuntu/cto-aipa/.env}"
unset API_FILM_AUDIO_FROM
unset API_FILM_CRAWLERS_SRC
unset API_FILM_ALLOW_MUSIC_CACHE

echo "=== v15-compile $(date -u +%Y-%m-%dT%H:%M:%SZ) dir=$DIR ==="
command -v ffmpeg && command -v ffprobe && command -v node || { echo FATAL: ffmpeg/node; exit 1; }
[ -f "$KIT/compile-v15.mjs" ] || { echo "FATAL: $KIT/compile-v15.mjs missing"; exit 1; }
[ -f "$KIT/hero-clip-v15.mjs" ] || { echo "FATAL: $KIT/hero-clip-v15.mjs missing"; exit 1; }
[ -f "$KIT/fetch-pixabay-music.py" ] || { echo "FATAL: fetch-pixabay-music.py missing"; exit 1; }

mkdir -p "$DIR"/{work,vo-v15,clips,out,music,loom}
# Drop leftover v13 grape/pomegranate clips only. Keep mango/papaya/dragon/pineapple/starfruit.
rm -f "$DIR"/clips/{grapes,split,crawlers,hand,dashboard}.mp4
if [ -z "${API_FILM_MUSIC:-}" ]; then
  rm -f "$DIR/music/SELECTED.path"
fi

echo
echo "=== 0. keys present (names only) ==="
python3 - <<PY
from pathlib import Path
import os
text = ""
p = Path(os.environ.get("CTO_ENV", "/home/ubuntu/cto-aipa/.env"))
if p.exists():
    text = p.read_text()
def present(k):
    if os.environ.get(k, "").strip():
        return True
    return any(line.startswith(k+"=") and line.split("=",1)[1].strip() for line in text.splitlines())
for k in ("OPENAI_API_KEY", "REPLICATE_API_TOKEN", "DEEPSEEK_API_KEY", "BRIGHTDATA_API_TOKEN"):
    print(f"{k}: {'yes' if present(k) else 'NO'}")
PY

echo
echo "=== 1. no Loom — how-to slides show how to use /api ==="
unset API_FILM_LOOM
rm -f "$DIR/loom/walkthrough.mp4"

echo
echo "=== 1c. juicy unused Pixabay (Mango Sky burned — Beach Party or later) ==="
if [ -n "${API_FILM_MUSIC:-}" ] && [ -f "$API_FILM_MUSIC" ]; then
  echo "API_FILM_MUSIC already staged $API_FILM_MUSIC"
  ls -lh "$API_FILM_MUSIC"
else
  set +e
  API_FILM_CUT=v15 python3 "$KIT/fetch-pixabay-music.py"
  MUSIC_RC=$?
  set -e
  if [ "$MUSIC_RC" -ne 0 ]; then
    echo "FATAL: juicy Pixabay fetch failed rc=$MUSIC_RC — refusing drone"
    exit "$MUSIC_RC"
  fi
  if [ -f "$DIR/music/SELECTED.path" ]; then
    export API_FILM_MUSIC="$(head -n1 "$DIR/music/SELECTED.path" | tr -d '\r')"
    echo "API_FILM_MUSIC=$API_FILM_MUSIC"
    [ -f "$DIR/music/SELECTED.credit" ] && echo "CREDIT $(cat "$DIR/music/SELECTED.credit")"
  fi
fi
[ -n "${API_FILM_MUSIC:-}" ] && [ -f "$API_FILM_MUSIC" ] || { echo FATAL: no selected music; exit 1; }

if [ -f "$DIR/clips/mango.mp4" ] && [ -f "$DIR/clips/papaya.mp4" ]; then
  export API_FILM_FRUIT_READY=1
  echo "API_FILM_FRUIT_READY=1 (DeepSeek-directed void fruit clips present)"
fi

echo
echo "=== 2. compile-v15. No service restart. ==="
set +e
node "$KIT/compile-v15.mjs"
RC=$?
set -e
echo "compile exit $RC"
ls -lh "$DIR/out" || true
V15="$DIR/out/can-ai-find-and-cite-you-v15.mp4"
[ -f "$V15" ] || { echo FATAL: v15 missing; exit 1; }
for banned in can-ai-find-and-cite-you.mp4 can-ai-find-and-cite-you-v12.mp4 can-ai-find-and-cite-you-v13.mp4 can-ai-find-and-cite-you-v14.mp4; do
  if [ -f "$DIR/out/$banned" ]; then
    echo "FATAL: compile wrote $banned — v15 must not touch older cuts"
    exit 1
  fi
done
DUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$V15" || echo 0)
echo "v15-duration=$DUR"
awk -v d="$DUR" 'BEGIN { if (d+0 < 90) { print "FATAL: v15 shorter than 90s — stub"; exit 1 } }'

STAMP=$(date -u +%Y%m%d%H%M%S)
WATCH_SRC=""
for w in \
  "$KIT/../oracle-resilience/api-film-watch-v15.html" \
  "$KIT/api-film-watch-v15.html" \
  /tmp/api-film-watch-v15.html
do
  if [ -f "$w" ]; then WATCH_SRC="$w"; break; fi
done
if [ -n "$WATCH_SRC" ]; then
  sed "s/CACHEBUST/$STAMP/g" "$WATCH_SRC" > "$DIR/out/watch-v15.html"
fi
echo "V15_OK dur=$DUR rc=$RC music=${API_FILM_MUSIC:-unset}"
exit "$RC"
