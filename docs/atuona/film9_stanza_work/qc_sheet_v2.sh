#!/bin/bash
# 10 Oct 2026: one labelled frame per piece of a film #9 build, tiled into a contact sheet, for the eye check after a compile.
# Reads WORK/work/timeline.json (shots) and the glitch_only/glitch_after items of the cut; every frame is taken 1.0 s into the
# piece (0.4 s for a flash) so dissolves are over. Usage: qc_sheet_v2.sh <film.mp4> <timeline.json> <cut.json> <out.jpg>
set -e
FILM="$1"; TL="$2"; CUT="$3"; OUT="$4"
FB=/c/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32
TMP="$(dirname "$OUT")/qc_frames"; rm -rf "$TMP"; mkdir -p "$TMP"
# a 'C:/...' path inside a filter string breaks ffmpeg's option parser (':' separates options), so the font is copied next to
# the frames and ffmpeg runs from there with a relative name
cp "$(dirname "$OUT")/work/fonts/DejaVuSansMono.ttf" "$TMP/f.ttf"; FONT=f.ttf; cd "$TMP"
python -I - "$TL" "$CUT" "$TMP/list.txt" <<'EOF'
import json, sys
tl = json.load(open(sys.argv[1])); cut = json.load(open(sys.argv[2]))
# glitch pieces are not in timeline.json: place each from its neighbours (after the shot before it, +0.1 s cut)
starts = {t['shot']: t for t in tl}
rows = []; prev_end = None
items = cut['items']
for k, it in enumerate(items):
    if 'clip' in it:
        t = starts[it['sid']]; rows.append((it['sid'], t['start'] + 1.0)); prev_end = t['start'] + t['dur']
        if it.get('glitch_after'): rows.append((f"after_{it['sid']}", prev_end - 0.1 + 0.4)); prev_end = prev_end - 0.1 + 1.2
    elif it.get('glitch_only'):
        rows.append((it['sid'], (prev_end or 0) - 0.1 + 0.4)); prev_end = (prev_end or 0) - 0.1 + it.get('glitch_dur', 1.2)
    elif it.get('card'):
        rows.append((it['sid'], (prev_end or 0) + 1.0)); prev_end = (prev_end or 0) + it.get('card_dur', 4.5)
open(sys.argv[3], 'w', newline='\n').write('\n'.join(f"{s}|{t:.2f}" for s, t in rows) + '\n')   # trailing newline or bash `read` drops the last piece; newline='\n': Windows text mode would write \r\n and ffmpeg would see "4.12\r"
print(len(rows), 'pieces')
EOF
n=0
while IFS='|' read -r sid t; do
  n=$((n+1)); f=$(printf "%s/%03d_%s.png" "$TMP" "$n" "$sid")
  "$FB/ffmpeg.exe" -v error -y -ss "$t" -i "$FILM" -frames:v 1 -vf "scale=480:270,drawtext=fontfile=$FONT:text='$sid @ ${t}s':fontcolor=yellow:fontsize=22:x=8:y=8:box=1:boxcolor=black@0.6" "$f"
  echo "file '$(basename "$f")'" >> "$TMP/concat.txt"   # relative: the concat demuxer cannot read Git Bash /c/... paths
done < "$TMP/list.txt"
cols=6; rows=$(( (n + cols - 1) / cols ))
"$FB/ffmpeg.exe" -v error -y -f concat -safe 0 -i "$TMP/concat.txt" -vf "tile=${cols}x${rows}" -frames:v 1 -q:v 3 "$OUT"
echo "SHEET $OUT ($n frames)"
