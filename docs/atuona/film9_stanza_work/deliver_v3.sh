#!/bin/bash
# 10 Oct 2026: deliver the film #9 v3 (final) cut with each of the three new music takes (Elena is choosing A/B/C) + no music.
# Laptop, Git Bash, repo root. Usage: deliver_v3.sh   (reads render_v3/work/body.mp4; never renders on Oracle)
#  1. the silent body + each track (same graph as the compile's music-only mode) -> 1080p masters, picture stream-copied
#  2. 720p phone copies under Telegram's 50 MB bot limit
#  3. filed under 05_FILM_PREVIEW/v3_2026-10-10/ in the material folder, md5 lines appended
#  4. scp to Oracle (light job only), send_preview_tg.sh, removed from Oracle
set -e
FB=/c/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32
P=/c/Users/kirav/Pictures/Atuona-film9-private
R=$P/render_v3; W=$R/work; APM=$P/APPROVED_2026-10-08/music
MAT="/d/ATUONA_FILM9_ALL_MATERIAL_2026-10-08"; DEST="$MAT/05_FILM_PREVIEW/v3_2026-10-10"
LEN=$("$FB/ffprobe.exe" -v error -show_entries format=duration -of csv=p=0 "$W/body.mp4"); echo "body ${LEN}s"
ST=$(python -c "print(f'{$LEN-3:.2f}')")
"$FB/ffmpeg.exe" -v error -y -i "$W/body.mp4" -c copy -movflags +faststart "$W/final_nomusic.mp4"
for t in noir velvet basement; do
  TL=$("$FB/ffprobe.exe" -v error -show_entries format=duration -of csv=p=0 "$APM/film9_v2_$t.mp3")
  python -c "import sys; sys.exit(0 if $TL >= $LEN else 1)" || { echo "track $t ${TL}s shorter than film"; exit 1; }
  "$FB/ffmpeg.exe" -v error -y -i "$W/body.mp4" -i "$APM/film9_v2_$t.mp3" -filter_complex "[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.30,afade=t=in:st=0:d=2,afade=t=out:st=$ST:d=3,loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.79:level=false[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 256k -ar 44100 -t "$LEN" -movflags +faststart "$W/final_music_$t.mp4"
done
enc() { "$FB/ffmpeg.exe" -v error -y -i "$1" -vf scale=1280:720 -c:v libx264 -preset veryfast -b:v 2200k -maxrate 2800k -bufsize 5600k -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart "$2"; }
for t in noir velvet basement; do enc "$W/final_music_$t.mp4" "$R/ATUONA_film9_v3_${t}_phone.mp4"; done
enc "$W/final_nomusic.mp4" "$R/ATUONA_film9_v3_nomusic_phone.mp4"
for f in "$R"/ATUONA_film9_v3_*_phone.mp4; do s=$(stat -c %s "$f"); echo "$(basename "$f") $((s/1048576)) MB"; [ "$s" -lt 50000000 ] || { echo "over 50 MB"; exit 1; }; done
mkdir -p "$DEST"
for t in noir velvet basement; do cp "$W/final_music_$t.mp4" "$DEST/ATUONA_film9_v3_${t}_1080p.mp4"; done
cp "$W/final_nomusic.mp4" "$DEST/ATUONA_film9_v3_nomusic_1080p.mp4"
cp "$R"/ATUONA_film9_v3_*_phone.mp4 "$DEST/"
cp docs/atuona/film9_stanza_work/cut_v3_2026-10-10.json "$DEST/"
cp "$R/qc_sheet_master.jpg" "$DEST/qc_sheet.jpg" 2>/dev/null || true
( cd "$MAT" && md5sum 05_FILM_PREVIEW/v3_2026-10-10/* | sed 's|^\([0-9a-f]*\)  |\1 *./|' >> MD5SUMS.txt && tail -10 MD5SUMS.txt )
ssh oracle-cto-aipa 'df -h / | tail -1'
( cd "$R" && md5sum ATUONA_film9_v3_noir_phone.mp4 ATUONA_film9_v3_velvet_phone.mp4 ATUONA_film9_v3_basement_phone.mp4 )
scp -q "$R/ATUONA_film9_v3_noir_phone.mp4" "$R/ATUONA_film9_v3_velvet_phone.mp4" "$R/ATUONA_film9_v3_basement_phone.mp4" oracle-cto-aipa:atuona-film9/
M=$(python -c "print(f'{int($LEN)//60}:{int($LEN)%60:02d}')")
ssh oracle-cto-aipa "cd ~/atuona-film9 && md5sum ATUONA_film9_v3_*_phone.mp4 && \
./send_preview_tg.sh ATUONA_film9_v3_noir_phone.mp4 'ATUONA film #9 - FINAL CUT v3 ($M), your 4 edits done: walk = full Luma shot, cage shot shorter, window shot removed, salt-on-skin back to full length and glitchy. Music A of 3: NOIR.' && \
./send_preview_tg.sh ATUONA_film9_v3_velvet_phone.mp4 'Final cut v3 - music B of 3: VELVET.' && \
./send_preview_tg.sh ATUONA_film9_v3_basement_phone.mp4 'Final cut v3 - music C of 3: BASEMENT. Tell me A, B or C and the film is finished.' && \
rm -v ATUONA_film9_v3_*_phone.mp4"
echo "DELIVERED v3 -> $DEST"
