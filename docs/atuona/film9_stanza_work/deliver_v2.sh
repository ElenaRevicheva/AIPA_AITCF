#!/bin/bash
# 10 Oct 2026: deliver a film #9 v2 build to Elena's phone and file it in the material folder. Laptop, Git Bash, repo root.
# Usage: deliver_v2.sh <final.mp4> <label e.g. v2_2026-10-10>
#  1. a no-music variant is muxed from the same silent body (same picture)
#  2. two 720p phone copies under Telegram's 50 MB bot limit
#  3. master + phone copies + QC sheet + cut filed under 05_FILM_PREVIEW/<label>/ in the ALL-material folder, md5 lines appended
#  4. phone copies scp'd to Oracle (light job only — never render there), sent with send_preview_tg.sh, then removed from Oracle
set -e
FINAL="$1"; LABEL="$2"
FB=/c/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32
R=/c/Users/kirav/Pictures/Atuona-film9-private/render_v2
MAT="/d/ATUONA_FILM9_ALL_MATERIAL_2026-10-08"
DEST="$MAT/05_FILM_PREVIEW/$LABEL"
CUT=docs/atuona/film9_stanza_work/cut_v2_2026-10-10.json
test -f "$FINAL" || { echo "no $FINAL"; exit 1; }
mkdir -p "$DEST"
BODY="$(dirname "$FINAL")/body.mp4"
NOMUSIC="$(dirname "$FINAL")/final_nomusic.mp4"
"$FB/ffmpeg.exe" -v error -y -i "$BODY" -c copy -movflags +faststart "$NOMUSIC"
LEN=$("$FB/ffprobe.exe" -v error -show_entries format=duration -of csv=p=0 "$FINAL")
echo "master ${LEN}s"
enc() { "$FB/ffmpeg.exe" -v error -y -i "$1" -vf scale=1280:720 -c:v libx264 -preset veryfast -b:v 2200k -maxrate 2800k -bufsize 5600k -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart "$2"; }
P1="$R/ATUONA_film9_${LABEL}_phone.mp4"; P2="$R/ATUONA_film9_${LABEL}_nomusic_phone.mp4"
enc "$FINAL" "$P1"; enc "$NOMUSIC" "$P2"
for f in "$P1" "$P2"; do s=$(stat -c %s "$f"); echo "$(basename "$f") $((s/1048576)) MB"; [ "$s" -lt 50000000 ] || { echo "over the 50 MB Telegram limit"; exit 1; }; done
cp "$FINAL" "$DEST/ATUONA_film9_${LABEL}_1080p.mp4"
cp "$NOMUSIC" "$DEST/ATUONA_film9_${LABEL}_1080p_nomusic.mp4"
cp "$P1" "$P2" "$DEST/"
cp "$R/qc_sheet_master.jpg" "$DEST/qc_sheet.jpg" 2>/dev/null || cp "$R/qc_sheet_preview.jpg" "$DEST/qc_sheet.jpg"
cp "$CUT" "$DEST/"
cp docs/atuona/FILM9_V2_EDIT_2026-10-10.md "$DEST/"
( cd "$MAT" && md5sum "05_FILM_PREVIEW/$LABEL"/* | sed 's|^\([0-9a-f]*\)  |\1 *./|' >> MD5SUMS.txt && tail -8 MD5SUMS.txt )
ssh oracle-cto-aipa 'df -h / | tail -1'
scp -q "$P1" "$P2" oracle-cto-aipa:atuona-film9/
ssh oracle-cto-aipa "cd ~/atuona-film9 && md5sum $(basename "$P1") $(basename "$P2")"
md5sum "$P1" "$P2"
CAP1="ATUONA film #9 - v2 cut from your screenshots (10 Oct). ${LEN%.*} s, 24 shots + 10 glitch flashes. Removed 13 shots, shortened 8, five shots are now short glitches, 36 cut when the walk ends, v30b and the auction-lots clip added, 4 new glitches from your 4 images. No voice (on hold). This copy: with the deep-house bed."
CAP2="Same v2 cut, no music (the bed you called ugly is left out). Full record: docs/atuona/FILM9_V2_EDIT_2026-10-10.md"
ssh oracle-cto-aipa "cd ~/atuona-film9 && ./send_preview_tg.sh $(basename "$P1") \"$CAP1\" && ./send_preview_tg.sh $(basename "$P2") \"$CAP2\" && rm -v $(basename "$P1") $(basename "$P2")"
echo "DELIVERED $LABEL -> $DEST"
