#!/bin/bash
# 12 Oct 2026 (Elena: "send me a video that i can upload to youtube and insta"): the Instagram Reel of AREAREA.
# 9:16 1080x1920 — the 16:9 master whole (never cropped: the typed stanzas sit in the lower-left corner), centred on black,
# the title above it and the signature below in the film's own mono face. Two-pass to stay under Telegram's 50 MB bot limit
# so it reaches her phone; Instagram re-encodes everything to roughly this rate anyway.
# Usage: make_reel.sh <master.mp4> <JetBrainsMono-400.ttf dir> <out.mp4>
set -e
M="$1"; FD="$2"; OUT="$3"
LEN=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$M")
VB=$(python -c "print(int((48.5e6*8/$LEN - 160e3)/1000))")   # kbit/s for the video, 48.5 MB total with 160k audio
cd "$FD"
printf 'A R E A R E A' > _t.txt; printf 'KIRA VELEREVICH  //  ATUONA.XYZ' > _s.txt
VF="scale=1080:-2:flags=lanczos,pad=1080:1920:0:(oh-ih)/2:black,drawtext=fontfile=JetBrainsMono-400.ttf:textfile=_t.txt:fontcolor=white:fontsize=58:x=(w-text_w)/2:y=(h-608)/2-150,drawtext=fontfile=JetBrainsMono-400.ttf:textfile=_s.txt:fontcolor=0x9A9A9A:fontsize=30:x=(w-text_w)/2:y=(h+608)/2+110,format=yuv420p"
ffmpeg -v error -y -i "$M" -vf "$VF" -c:v libx264 -preset slow -b:v ${VB}k -pass 1 -passlogfile _reel -an -f mp4 NUL
ffmpeg -v error -y -i "$M" -vf "$VF" -c:v libx264 -preset slow -b:v ${VB}k -pass 2 -passlogfile _reel -r 24 -c:a aac -b:a 160k -ar 44100 -movflags +faststart "$OUT"
rm -f _t.txt _s.txt _reel*
echo "reel $(du -m "$OUT" | cut -f1) MB, video ${VB}k, $LEN s"
