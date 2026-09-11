#!/usr/bin/env bash
# Replace the v12 bed only. Picture + onyx VO stay. Does not restart services.
set -uo pipefail

MODE="${1:-api-film-music}"
DIR=/home/ubuntu/aideazz-api-film
PUBLISH=/var/www/influencer-images/youtube
PUBLIC=https://webhook.aideazz.xyz/influencer-images/youtube
SRC_MP4="$PUBLISH/can-ai-find-and-cite-you-v12.mp4"
OUT13="$DIR/out/can-ai-find-and-cite-you-v13.mp4"

echo "=== api-film-music $(date -u +%Y-%m-%dT%H:%M:%SZ) mode=$MODE ==="
[ "$MODE" = "api-film-music" ] || { echo "expected mode=api-film-music"; exit 1; }
[ -f "$SRC_MP4" ] || { echo "FATAL: $SRC_MP4 missing"; exit 1; }
command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null || { echo "FATAL: ffmpeg missing"; exit 1; }
ls "$DIR/vo"/v_*.mp3 >/dev/null 2>&1 || { echo "FATAL: vo stems missing in $DIR/vo"; exit 1; }

echo
echo "=== 0. fetch 2026 joyful energetic chillout (not enigmatic, not drone) ==="
mkdir -p "$DIR/music" "$DIR/out" "$DIR/kit"
if [ -f /tmp/youtube-api-audit-film/fetch-pixabay-music.py ]; then
  cp -f /tmp/youtube-api-audit-film/fetch-pixabay-music.py "$DIR/kit/fetch-pixabay-music.py"
elif [ -f "$DIR/kit/fetch-pixabay-music.py" ]; then
  true
else
  echo "FATAL: fetch-pixabay-music.py missing"
  exit 1
fi
# Do not reuse Oleg-Mazur enigmatic lounge or the brown-noise drone.
rm -f "$DIR/music/SELECTED.path" \
  "$DIR/music/chillout-lounge-2026-pixabay.mp3" \
  "$DIR/work/drone.mp3"
export API_FILM_DIR="$DIR"
export API_FILM_MUSIC_DIR="$DIR/music"
export CTO_ENV=/home/ubuntu/cto-aipa/.env
set +e
python3 "$DIR/kit/fetch-pixabay-music.py"
MUSIC_RC=$?
set -e
[ "$MUSIC_RC" -eq 0 ] || { echo "FATAL: Pixabay fetch rc=$MUSIC_RC"; exit "$MUSIC_RC"; }
MUSIC="$(head -n1 "$DIR/music/SELECTED.path" | tr -d '\r')"
[ -f "$MUSIC" ] || { echo "FATAL: SELECTED music missing"; exit 1; }
echo "MUSIC=$MUSIC ($(wc -c < "$MUSIC") bytes)"

echo
echo "=== 1. remix: v12 video + new bed + 11 onyx stems ==="
LEN=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$SRC_MP4")
echo "src duration=$LEN"
python3 - "$SRC_MP4" "$MUSIC" "$DIR/vo" "$OUT13" "$LEN" <<'PY'
import subprocess, sys
from pathlib import Path

src, music, vo_dir, dest, length = sys.argv[1:6]
durs = [4.4, 8.0, 7.8, 8.2, 6.5, 11.2, 16.0, 8.0, 9.2, 6.5, 8.2, 8.0, 10.3, 9.5, 6.5, 5.8]
xfade, lead = 1.3, 0.7

def seg_start(k):
    return max(0.0, sum(durs[:k]) - k * xfade)

# beat id -> seq index (intro is 0)
vo_beats = [
    ("split", 2),
    ("crawlers", 3),
    ("hand", 4),
    ("dashboard", 5),
    ("hero", 8),
    ("form", 9),
    ("auditing", 10),
    ("score", 11),
    ("checks", 12),
    ("categories", 13),
    ("cta", 14),
]
stems = []
for bid, idx in vo_beats:
    p = Path(vo_dir) / f"v_{bid}.mp3"
    if p.exists() and p.stat().st_size > 1000:
        stems.append((str(p), seg_start(idx) + lead, bid))
    else:
        print(f"WARN missing stem {p}", flush=True)
if len(stems) < 8:
    raise SystemExit(f"need most VO stems, got {len(stems)}")

fade_out = max(0.5, float(length) - 3.0)
cmd = ["ffmpeg", "-y", "-v", "error", "-i", src, "-stream_loop", "-1", "-i", music]
for path, _, _ in stems:
    cmd += ["-i", path]
mf = (
    f"[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.22,"
    f"afade=t=in:st=0:d=2,afade=t=out:st={fade_out:.2f}:d=3[music];"
)
labs = []
for i, (path, t, bid) in enumerate(stems):
    cmd_idx = i + 2
    mf += f"[{cmd_idx}:a]aresample=44100,aformat=channel_layouts=stereo,adelay={int(round(t*1000))}:all=1[v{i}];"
    labs.append(f"[v{i}]")
    print(f"vo {bid} @{t:.2f}s", flush=True)
mf += (
    f"{''.join(labs)}amix=inputs={len(labs)}:normalize=0:dropout_transition=0,volume=1.9,asplit=2[vsc][vmix];"
    "[music][vsc]sidechaincompress=threshold=0.02:ratio=10:attack=5:release=300[ducked];"
    "[ducked][vmix]amix=inputs=2:normalize=0:dropout_transition=0[premix];"
    "[premix]loudnorm=I=-16:TP=-1.5:LRA=11[a]"
)
cmd += [
    "-filter_complex", mf,
    "-map", "0:v", "-map", "[a]",
    "-t", f"{float(length):.2f}",
    "-c:v", "copy", "-c:a", "aac", "-ar", "44100", "-b:a", "192k",
    dest,
]
print("ffmpeg remix...", flush=True)
subprocess.check_call(cmd)
print(f"wrote {dest}", flush=True)
PY

[ -f "$OUT13" ] || { echo "FATAL: v13 not written"; exit 1; }
ls -lh "$OUT13"
ffprobe -v error -show_entries format=duration -of default=nw=1 "$OUT13"

echo
echo "=== 2. publish v13 ==="
sudo mkdir -p "$PUBLISH"
sudo cp -f "$OUT13" "$PUBLISH/can-ai-find-and-cite-you-v13.mp4"
sudo cp -f "$OUT13" "$PUBLISH/can-ai-find-and-cite-you.mp4"
if [ -f /tmp/api-film-watch.html ]; then
  sed "s/CACHEBUST/$(date -u +%Y%m%d%H%M%S)/g" \
    /tmp/api-film-watch.html | sudo tee "$PUBLISH/watch.html" >/dev/null
fi
sudo chown -R www-data:www-data /var/www/influencer-images
sudo find "$PUBLISH" -type d -exec chmod 755 {} \;
sudo find "$PUBLISH" -type f -exec chmod 644 {} \;
set +e
for u in \
  "$PUBLIC/can-ai-find-and-cite-you-v13.mp4" \
  "$PUBLIC/watch.html"
do
  code=$(curl -sS -o /dev/null -w "%{http_code} %{content_type} %{size_download}" --max-time 20 -L "$u" || echo "curl-fail")
  echo "$code  $u"
done
DUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$PUBLISH/can-ai-find-and-cite-you-v13.mp4" || echo 0)
printf 'v13-duration=%s\n' "$DUR"
printf 'music=%s\n' "$MUSIC"
echo "DONE api-film-music"
echo "ELENA: watch ${PUBLIC}/can-ai-find-and-cite-you-v13.mp4"
printf 'or %s/watch.html\n' "$PUBLIC"
awk -v d="$DUR" 'BEGIN { if (d+0 < 90) { print "FATAL: v13 shorter than 90s"; exit 1 } }'
