#!/bin/bash
# 11 Oct 2026 - Arearea v2 standalone shot, finished on the LAPTOP: the Kling O3 4K clip (frame kR3, GPT Image 2.5 Flare) slowed to
# the length of the #087 stream (motion-interpolated from 4K), the film's flowing glitch, fragment #087 streamed whole in PowerShell
# (lines 40-46 typed with the onyx narrator), music C under it. Not part of the ATUONA film (Elena).
set -e
cd "$(dirname "$0")"
FB=/c/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32
P=/c/Users/kirav/Pictures/Atuona-film9-private
CLIP=$P/APPROVED_2026-10-08/clips/vkR3__venice-kling-o3-4k.mp4
FT=$(cygpath -m /tmp/ft)
D=17.5; LEAD=3.35
SRC=$("$FB/ffprobe.exe" -v error -select_streams v:0 -show_entries stream=duration -of csv=p=0 "$CLIP")
F=$(python -c "print(round($D / ($SRC - 0.05), 5))")
node "$FT/chain.cjs" $D 7 "$FT/chain_a2.txt"
VD=$("$FB/ffprobe.exe" -v error -show_entries format=duration -of csv=p=0 $P/render_v11/vo/A.mp3)
( cd "$FT" && node harness11.cjs D:/aideazz/ai-cofounders/cto-aipa/docs/atuona/film9_stanza_work/cut_v11_2026-10-11.json $D $VD tA2.ass )
cp "$FT/tA2.ass" ./tA2.ass && rm -rf tfonts && cp -r "$FT/tfonts" ./tfonts
# 1. picture: 4K -> 1080p, slowed with motion interpolation, the flowing glitch, then the PowerShell stream on top
[ -f pic.mp4 ] || "$FB/ffmpeg.exe" -v error -y -i "$CLIP" -filter_complex "[0:v]scale=1920:1080:flags=lanczos,setpts=${F}*(PTS-STARTPTS),minterpolate=fps=24:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,$(cat "$FT/chain_a2.txt"),format=yuv420p,ass=tA2.ass:fontsdir=tfonts,fade=t=in:st=0:d=0.8,fade=t=out:st=$(python -c "print($D-1.0)"):d=1.0[v]" -map "[v]" -t $D -an -c:v libx264 -preset slow -crf 15 -pix_fmt yuv420p pic.mp4
# 2. sound: the narrator at LEAD over music C (from its 60 s mark, faded), loudness -16
"$FB/ffmpeg.exe" -v error -y -i pic.mp4 -i $P/render_v11/vo/A.mp3 -i $P/APPROVED_2026-10-08/music/film9_v2_basement.mp3 -filter_complex "[1:a]adelay=3350|3350,volume=1.9[vo];[2:a]atrim=start=60,asetpts=PTS-STARTPTS,volume=0.34,afade=t=in:d=1.5,afade=t=out:st=$(python -c "print($D-2.0)"):d=2[m];[vo]asplit[v1][v2];[m][v1]sidechaincompress=threshold=0.02:ratio=3:attack=5:release=300[duck];[duck][v2]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5[a]" -map 0:v -map "[a]" -t $D -c:v copy -c:a aac -b:a 192k -movflags +faststart AREAREA_v2_2026-10-11_1080p.mp4
"$FB/ffmpeg.exe" -v error -y -i AREAREA_v2_2026-10-11_1080p.mp4 -vf scale=1280:720 -c:v libx264 -preset veryfast -b:v 2800k -maxrate 3400k -bufsize 6800k -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart AREAREA_v2_2026-10-11_phone.mp4
ls -la AREAREA_v2_2026-10-11_*.mp4
