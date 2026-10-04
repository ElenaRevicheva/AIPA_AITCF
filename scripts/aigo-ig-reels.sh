#!/bin/bash
# AIGO films -> Instagram Reels (4 Oct 2026). Composites each published 16:9 master into a 1080x1920 Reel: a blurred, darkened
# fill of the same film behind, the film itself 1080x608 at y 656, and the transparent overlay (aigo-ig-reel-overlays.py) on top.
# Output follows Meta's Reels spec (H.264, yuv420p, closed GOP, 24 fps, AAC, moov atom at the FRONT = +faststart, no edit lists).
# Reads the Make rotation's files READ-ONLY (never overwrites /var/www/influencer-images/youtube/aigo-film-*.mp4).
# One encode at a time with nice (2 vCPU; an earlier parallel job OOM-killed a service). Runs on Oracle in ~/aigo-ig.
set -e
cd ~/aigo-ig
for pair in "yacht:aigo-film-1-yacht" "api:aigo-film-2-api" "villa:aigo-film-3-villa" "reloc:aigo-film-4-relocation" "medtour:aigo-film-5-medtour"; do
  key=${pair%%:*}; src=/var/www/influencer-images/youtube/${pair#*:}.mp4; out=reel_${key}_v1.mp4
  [ -f "$out" ] && { echo "skip $out"; continue; }
  nice -n 10 ffmpeg -v error -y -i "$src" -i overlays/reel_overlay_${key}.png -filter_complex \
    "[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=28:2,eq=brightness=-0.22:saturation=0.85[bg];[b]scale=1080:-2[fg];[bg][fg]overlay=0:656[v1];[v1][1:v]overlay=0:0,format=yuv420p[v]" \
    -map "[v]" -map 0:a -c:v libx264 -preset medium -crf 20 -r 24 -g 48 -keyint_min 48 -sc_threshold 0 -profile:v high -level 4.1 \
    -c:a aac -b:a 192k -ar 44100 -movflags +faststart -use_editlist 0 "$out"
  echo "OK $out $(ffprobe -v error -show_entries format=duration:stream=width,height -of csv=p=0 $out | tr '\n' ' ')"
done
echo DONE
