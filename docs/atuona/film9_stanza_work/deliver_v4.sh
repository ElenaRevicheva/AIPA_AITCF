#!/bin/bash
# 10 Oct 2026: deliver the film #9 v4 FINAL (music C mixed by the compile). Laptop, Git Bash, repo root. Never renders on Oracle.
#  1. no-music variant muxed from the same silent body  2. 720p phone copy under Telegram's 50 MB limit
#  3. filed under 05_FILM_PREVIEW/v4_FINAL_2026-10-10/, md5 appended  4. scp to Oracle, send_preview_tg.sh, removed from Oracle
set -e
FB=/c/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32
R=/c/Users/kirav/Pictures/Atuona-film9-private/render_v4; W=$R/work
MAT="/d/ATUONA_FILM9_ALL_MATERIAL_2026-10-08"; DEST="$MAT/05_FILM_PREVIEW/v4_FINAL_2026-10-10"
test -f "$W/final.mp4" || { echo "no final.mp4"; exit 1; }
"$FB/ffmpeg.exe" -v error -y -i "$W/body.mp4" -c copy -movflags +faststart "$W/final_nomusic.mp4"
LEN=$("$FB/ffprobe.exe" -v error -show_entries format=duration -of csv=p=0 "$W/final.mp4"); echo "final ${LEN}s"
P1="$R/ATUONA_film9_FINAL_2026-10-10_phone.mp4"
"$FB/ffmpeg.exe" -v error -y -i "$W/final.mp4" -vf scale=1280:720 -c:v libx264 -preset veryfast -b:v 2200k -maxrate 2800k -bufsize 5600k -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart "$P1"
s=$(stat -c %s "$P1"); echo "phone $((s/1048576)) MB"; [ "$s" -lt 50000000 ] || { echo "over 50 MB"; exit 1; }
mkdir -p "$DEST"
cp "$W/final.mp4" "$DEST/ATUONA_film9_FINAL_2026-10-10_1080p.mp4"
cp "$W/final_nomusic.mp4" "$DEST/ATUONA_film9_FINAL_2026-10-10_1080p_nomusic.mp4"
cp "$P1" "$DEST/"; cp docs/atuona/film9_stanza_work/cut_v4_2026-10-10.json "$DEST/"
cp "$R/qc_sheet_master.jpg" "$DEST/qc_sheet.jpg" 2>/dev/null || true
( cd "$MAT" && md5sum 05_FILM_PREVIEW/v4_FINAL_2026-10-10/* | sed 's|^\([0-9a-f]*\)  |\1 *./|' >> MD5SUMS.txt && tail -5 MD5SUMS.txt )
ssh oracle-cto-aipa 'df -h / | tail -1'
md5sum "$P1"; scp -q "$P1" oracle-cto-aipa:atuona-film9/
B=$(basename "$P1"); M=$(python -c "print(f'{int($LEN)//60}:{int($LEN)%60:02d}')")
ssh oracle-cto-aipa "cd ~/atuona-film9 && md5sum $B && ./send_preview_tg.sh $B 'ATUONA film #9 - FINAL ($M). Music C (BASEMENT). Every shot glitchy, the salt-on-skin shot is now the real video (finger tracing the salt), mirror shot shorter.' && rm -v $B"
echo "DELIVERED FINAL -> $DEST"
