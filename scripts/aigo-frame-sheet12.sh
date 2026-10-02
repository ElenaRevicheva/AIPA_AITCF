#!/bin/bash
# usage: sheet12.sh in.mp4 out.jpg  -> 12 frames, 1 per (dur/12) s, labelled with t
in=$1; out=$2
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
tmp=$(mktemp -d)
for i in $(seq 0 11); do
  t=$(awk -v d=$d -v i=$i "BEGIN{printf \"%.1f\", d*i/12}")
  ffmpeg -v error -y -ss $t -i "$in" -frames:v 1 -vf "scale=480:-2,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text=t=${t}s:x=6:y=6:fontsize=20:fontcolor=yellow:box=1:boxcolor=black@0.6" $tmp/f_$(printf %02d $i).jpg
done
ffmpeg -v error -y -pattern_type glob -i "$tmp/f_*.jpg" -vf tile=4x3 -frames:v 1 "$out"
rm -rf $tmp
