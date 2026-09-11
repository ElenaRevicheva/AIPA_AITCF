#!/usr/bin/env bash
# Compile the /api YouTube film on Oracle using Atuona studio tools.
# Piped over SSH (mode=api-film [start|publish|all]).
# Does NOT restart cto-aipa / influencer / VJH.
# Does NOT POST a promo. Does NOT write into the Atuona poetry gallery.
set -uo pipefail

MODE="${1:-api-film}"
PHASE="${2:-all}"
DIR=/home/ubuntu/aideazz-api-film
SRC=/tmp/youtube-api-audit-film
PUBLISH=/var/www/influencer-images/youtube
PUBLIC=https://webhook.aideazz.xyz/influencer-images/youtube
OUT12="$DIR/out/can-ai-find-and-cite-you-v12.mp4"

redact() {
  sed -E \
    -e 's#https://hook\.[a-z0-9.-]*make\.com/[A-Za-z0-9_-]+#https://hook.make.com/[REDACTED]#g' \
    -e 's#(Bearer[[:space:]]+)[A-Za-z0-9._+/=-]{8,}#\1[REDACTED]#g' \
    -e 's#\b[0-9a-fA-F]{32,}\b#[REDACTED_HEX]#g'
}

film_running() {
  pgrep -f 'node /home/ubuntu/aideazz-api-film/kit/compile.mjs' >/dev/null 2>&1 \
    || pgrep -f 'ffmpeg.*aideazz-api-film' >/dev/null 2>&1
}

status_film() {
  echo "=== api-film status $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  pgrep -af 'compile.mjs|ffmpeg.*aideazz-api-film' | redact || echo "(no film jobs)"
  if [ -f "$DIR/compile.rc" ]; then
    echo "compile.rc=$(tr -d ' \r\n' < "$DIR/compile.rc")"
  else
    echo "compile.rc=missing"
  fi
  if [ -f "$DIR/compile.log" ]; then
    echo "----- compile.log tail -----"
    tail -n 12 "$DIR/compile.log" | redact || true
  fi
  if [ -f "$OUT12" ]; then
    echo "out-v12 $(ls -lh "$OUT12" | awk '{print $5}') dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT12" 2>/dev/null || echo 0)"
  else
    echo "out-v12 missing"
  fi
}

publish_film() {
  RC="${1:-1}"
  echo
  echo "=== 3. publish + probe ==="
  sudo mkdir -p "$PUBLISH"
  if [ "${RC:-1}" -eq 0 ] && [ -f "$OUT12" ]; then
    sudo cp -f "$DIR/out/"*.mp4 "$PUBLISH/" 2>/dev/null || true
    sudo cp -f "$DIR/out/"*.jpg "$PUBLISH/" 2>/dev/null || true
    sudo cp -f "$DIR/out/"*.png "$PUBLISH/" 2>/dev/null || true
    if [ -f "$DIR/kit/qr/api-cta-qr.png" ]; then
      sudo cp -f "$DIR/kit/qr/api-cta-qr.png" "$DIR/kit/qr/api-cta-endcard.png" "$PUBLISH/"
    fi
    if [ -f /tmp/api-film-watch.html ]; then
      sed "s/CACHEBUST/$(date -u +%Y%m%d%H%M%S)/g" \
        /tmp/api-film-watch.html | sudo tee "$PUBLISH/watch.html" >/dev/null
    fi
  else
    echo "SKIP publish — compile exit ${RC:-1} (keep live player / last good cut)"
  fi
  sudo chown -R www-data:www-data /var/www/influencer-images
  sudo find "$PUBLISH" -type d -exec chmod 755 {} \;
  sudo find "$PUBLISH" -type f -exec chmod 644 {} \;
  ls -lh "$PUBLISH" | redact
  for u in \
    "$PUBLIC/can-ai-find-and-cite-you-v12.mp4" \
    "$PUBLIC/can-ai-find-and-cite-you.mp4" \
    "$PUBLIC/can-ai-find-and-cite-you-poster.jpg" \
    "$PUBLIC/watch.html" \
    "$PUBLIC/api-cta-qr.png"
  do
    code=$(curl -sS -o /dev/null -w "%{http_code} %{content_type} %{size_download}" --max-time 20 -L "$u" || echo "curl-fail")
    echo "$code  $u"
  done
  set +e
  if [ -f "$PUBLISH/can-ai-find-and-cite-you-v12.mp4" ]; then
    ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate,bit_rate \
      -of default=nw=1 "$PUBLISH/can-ai-find-and-cite-you-v12.mp4" | redact
    ffmpeg -y -ss 7 -i "$PUBLISH/can-ai-find-and-cite-you-v12.mp4" -frames:v 1 -update 1 /tmp/api-film-frame-grapes.jpg
    ffmpeg -y -ss 22 -i "$PUBLISH/can-ai-find-and-cite-you-v12.mp4" -frames:v 1 -update 1 /tmp/api-film-frame-crawlers.jpg
    ffmpeg -y -ss 48 -i "$PUBLISH/can-ai-find-and-cite-you-v12.mp4" -frames:v 1 -update 1 /tmp/api-film-frame-loom.jpg
    printf 'frame-grapes bytes=%s\n' "$(wc -c < /tmp/api-film-frame-grapes.jpg 2>/dev/null || printf '0')"
    printf 'frame-crawlers bytes=%s\n' "$(wc -c < /tmp/api-film-frame-crawlers.jpg 2>/dev/null || printf '0')"
    printf 'frame-loom bytes=%s\n' "$(wc -c < /tmp/api-film-frame-loom.jpg 2>/dev/null || printf '0')"
    DUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$PUBLISH/can-ai-find-and-cite-you-v12.mp4" || echo 0)
    printf 'v12-duration=%s\n' "$DUR"
    awk -v d="$DUR" 'BEGIN { if (d+0 < 90) { print "FATAL: v12 shorter than 90s — stub, do not send Elena"; exit 1 } }' || RC=1
  fi
  echo "DONE api-film rc=${RC:-1}"
  echo "ELENA: watch ${PUBLIC}/can-ai-find-and-cite-you-v12.mp4"
  printf 'or %s/watch.html\n' "$PUBLIC"
  printf 'Do not drop this mp4 into Atuona /films. That gallery is poetry.\n'
  exit "${RC:-1}"
}

echo "=== api-film $(date -u +%Y-%m-%dT%H:%M:%SZ) mode=$MODE phase=$PHASE ==="
[ "$MODE" = "api-film" ] || { echo "expected mode=api-film"; exit 1; }

if [ "$PHASE" = "publish" ]; then
  status_film
  if film_running; then
    echo "NOTREADY compile still running"
    exit 2
  fi
  if [ ! -f "$DIR/compile.rc" ] && [ ! -f "$OUT12" ]; then
    echo "NOTREADY no compile.rc and no out-v12"
    exit 2
  fi
  RC=1
  if [ -f "$DIR/compile.rc" ]; then
    RC=$(tr -d ' \r\n' < "$DIR/compile.rc")
  fi
  if [ -f "$OUT12" ]; then
    EXIST_DUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT12" 2>/dev/null || echo 0)
    awk -v d="$EXIST_DUR" 'BEGIN { exit (d+0 >= 90 ? 0 : 1) }' && RC=0
  fi
  if [ "${RC:-1}" -ne 0 ]; then
    echo "FAIL compile rc=$RC — not publishing a stub"
    exit 1
  fi
  publish_film 0
fi

[ -d "$SRC" ] || { echo "FATAL: $SRC missing — scp the film kit first"; exit 1; }
[ -f "$SRC/compile.mjs" ] || { echo "FATAL: compile.mjs missing"; exit 1; }
command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null || { echo "FATAL: ffmpeg/ffprobe missing"; exit 1; }
command -v node >/dev/null || { echo "FATAL: node missing"; exit 1; }

if film_running; then
  echo "compile already running — not restaging (would clobber the stitch)"
  status_film
  if [ "$PHASE" = "start" ]; then
    echo "STARTED already-running"
    exit 0
  fi
  while film_running; do
    sleep 8
    tail -n 2 "$DIR/compile.log" | redact || true
  done
  RC=$(tr -d ' \r\n' < "$DIR/compile.rc" 2>/dev/null || echo 1)
  if [ -f "$OUT12" ]; then
    awk -v d="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT12" 2>/dev/null || echo 0)" 'BEGIN { exit (d+0 >= 90 ? 0 : 1) }' && RC=0
  fi
  publish_film "$RC"
fi

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
echo "=== 1a. Elena's muted Loom (prefer raw-url so it is not a 4MB preview) ==="
mkdir -p "$DIR/loom"
rm -f "$DIR/loom/walkthrough.mp4"
python3 "$DIR/kit/fetch-loom.py" --force --out "$DIR/loom/walkthrough.mp4"
[ -f "$DIR/loom/walkthrough.mp4" ] || { echo "FATAL: Loom walkthrough missing"; exit 1; }
export API_FILM_LOOM="$DIR/loom/walkthrough.mp4"
ls -lh "$API_FILM_LOOM"
ffprobe -v error -show_entries format=duration:stream=width,height,bit_rate -of default=nw=1 "$API_FILM_LOOM" || true

echo
echo "=== 1b. keep pomegranate clips. Rebuild grapes (vine still) + crawlers (insects). Regen UI + loomwalk ==="
export API_FILM_FORCE_FRUIT=1
rm -f "$DIR/clips/hero.mp4" "$DIR/clips/form.mp4" "$DIR/clips/auditing.mp4" \
  "$DIR/clips/score.mp4" "$DIR/clips/checks.mp4" "$DIR/clips/categories.mp4" \
  "$DIR/clips/cta.mp4" "$DIR/clips/website.mp4" "$DIR/clips/loomwalk.mp4"
mkdir -p "$DIR/clips"
ls -lh "$DIR/clips" || true

echo
echo "=== 1c. Pixabay 2026 chillout (not Tropical Cocktail, not Distant Horizon dreamy) ==="
echo "Atuona poetry library (do NOT pick from here):"
ls /home/ubuntu/cto-aipa/data/atuona/films/music 2>/dev/null | redact || echo "(missing)"
rm -f "$DIR/music/SELECTED.path" \
  "$DIR/music/fresh-tropical-cocktail-pixabay.mp3" \
  "$DIR/music/distant-horizon-chill-house-pixabay.mp3"
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
set +e

if film_running; then
  echo "compile already running after staging — not starting a second node"
  status_film
  RC=0
elif [ -f "$OUT12" ] && awk -v d="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT12" 2>/dev/null || echo 0)" 'BEGIN { exit (d+0 >= 90 ? 0 : 1) }'; then
  echo "reuse existing compile $(ls -lh "$OUT12" | awk '{print $5}')"
  echo 0 > "$DIR/compile.rc"
  RC=0
else
  rm -f "$DIR/compile.rc"
  : > "$DIR/compile.log"
  setsid nohup bash -c 'node /home/ubuntu/aideazz-api-film/kit/compile.mjs; echo $? > /home/ubuntu/aideazz-api-film/compile.rc' \
    >> "$DIR/compile.log" 2>&1 < /dev/null &
  echo $! > "$DIR/compile.pid"
  echo "compile pid=$(cat "$DIR/compile.pid") (survives SSH drop)"
  RC=0
fi

if [ "$PHASE" = "start" ]; then
  echo "STARTED phase=start rc=$RC music=${API_FILM_MUSIC:-unset}"
  status_film
  exit 0
fi

while [ ! -f "$DIR/compile.rc" ]; do
  if ! film_running && [ ! -f "$DIR/compile.rc" ]; then
    echo 1 > "$DIR/compile.rc"
    echo "WARN compile vanished without rc"
    break
  fi
  sleep 8
  tail -n 2 "$DIR/compile.log" | redact || true
done
RC=$(tr -d ' \r\n' < "$DIR/compile.rc" 2>/dev/null || echo 1)
echo "----- compile.log tail -----"
tail -n 40 "$DIR/compile.log" | redact || true
echo "compile exit $RC"
echo "music used: ${API_FILM_MUSIC:-unset}"
publish_film "$RC"
