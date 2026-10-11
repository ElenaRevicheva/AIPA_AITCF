#!/bin/bash
# 11 Oct 2026 - the Arearea final shot, post on the LAPTOP ($0): Elena "make it truly underground aesthetic impressionism style
# with ghosty surrealistic touch". On top of the still-motion clip (push-in, dust in the beam, the canvas draining to bare):
#  - the painting's own GHOST: a translucent, blurred double of Arearea lifts off the wall as the canvas empties, swells and drifts
#    toward the two figures and dissolves into the air (6.9 s -> ~14 s) - the painting leaving, nothing invented
#  - impressionist HALATION: highlights bloom into soft glowing light
#  - underground GRADE: deeper blacks, crimson in the shadows, warm highlights, heavier vignette
#  - AFTERIMAGE: a short echo (lagfun) on everything that moves - ghost, dust
# usage: ghost.sh <in.mp4> <out.mp4> [probe]   (probe = 4 still frames instead of the clip)
set -e
cd "$(dirname "$0")"
FB=/c/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32
IN="$1"; OUT="$2"
D=$("$FB/ffprobe.exe" -v error -show_entries format=duration -of csv=p=0 "$IN")
T0=6.9   # the canvas starts to drain (synced to "the painting isn't there")
FC="[1:v]scale=600:-2,format=rgba,gblur=sigma=4,colorchannelmixer=aa=0.72,fade=t=in:st=${T0}:d=1.6:alpha=1,fade=t=out:st=11.2:d=3.2:alpha=1,"
FC+="scale=w='600*(1+1.35*max(0\,t-${T0})/7)':h=-1:eval=frame[g];"
# the ghost starts over the canvas (centre ~ x 960, y 520 after the push-in) and drifts down-left toward Kira and the camera
FC+="[0:v][g]overlay=x='(W-w)/2 - 260*max(0\,t-${T0})/7':y='470-h/2 + 170*max(0\,t-${T0})/7':format=auto:eval=frame[v1];"
FC+="[v1]split[a][b];[b]curves=all='0/0 0.62/0 1/1',gblur=sigma=18[bloom];[a][bloom]blend=all_mode=screen:all_opacity=0.55[v2];"
FC+="[v2]colorbalance=rs=0.07:gs=-0.02:bs=0.02:rm=0.02:rh=0.03:bh=-0.03,curves=all='0/0 0.12/0.06 0.5/0.47 1/0.97',"
FC+="vignette=angle=PI/4.2,lagfun=decay=0.95,format=yuv420p[v]"
if [ "$3" = probe ]; then
  "$FB/ffmpeg.exe" -v error -y -i "$IN" -loop 1 -t "$D" -i arearea_ghost.png -filter_complex "$FC" -map "[v]" -t "$D" -c:v libx264 -preset ultrafast -crf 18 _probe.mp4
  for t in 3 8.5 10.5 13; do "$FB/ffmpeg.exe" -v error -y -ss $t -i _probe.mp4 -frames:v 1 -vf scale=640:-2 _p_$t.png; done
  "$FB/ffmpeg.exe" -v error -y -i _p_3.png -i _p_8.5.png -i _p_10.5.png -i _p_13.png -filter_complex "[0][1]hstack[a];[2][3]hstack[b];[a][b]vstack" "$OUT"
else
  "$FB/ffmpeg.exe" -v error -y -i "$IN" -loop 1 -t "$D" -i arearea_ghost.png -filter_complex "$FC" -map "[v]" -t "$D" -r 24 -c:v libx264 -preset slow -crf 14 -pix_fmt yuv420p "$OUT"
fi
echo "$OUT"
