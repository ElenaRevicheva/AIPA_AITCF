#!/bin/bash
# 11 Oct 2026 - shot 24b (Ule cries, the tear becomes the auction lots) re-graded on the LAPTOP, $0 (Venice balance $0.55).
# Elena: "colors are very weak ... make it genuinely emotionally underground aesthetic - show the pain, the sexual energy, the devilish
# beauty of Ule". From the clip itself, nothing generated:
#  - split tone: shadows deep blue-black, skin warmed, highlights pushed crimson; contrast up, blacks crushed, saturation up
#  - an infernal crimson under-light rising from the bottom of the frame (screen blend of a red gradient)
#  - HALATION: the brightest parts (tears, jewels, eyes) bloom into a crimson glow
#  - the OTHER ULE: a second copy, 0.42 s behind, 6 % larger, red-tinted, screen-blended at 30 % - the devil standing behind the man
#  - HEARTBEAT: the vignette and brightness pulse lub-dub ~62 bpm
#  - a fine chromatic split on the edges + grain; lagfun afterimage on everything that moves
# usage: grade_24b.sh <in.mp4> <out.mp4>
set -e
FB=/c/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32
IN="$1"; OUT="$2"
D=$("$FB/ffprobe.exe" -v error -select_streams v:0 -show_entries stream=duration -of csv=p=0 "$IN")
BEAT="(0.5+0.5*cos(2*PI*t*1.033))^14+0.6*(0.5+0.5*cos(2*PI*(t-0.22)*1.033))^14"     # lub-dub, ~62 bpm, 0..1.6
FC="[0:v]fps=24,format=gbrp,split=3[a][g0][h0];"
# the other Ule: delayed, larger, red, faint
FC+="[g0]tpad=start_duration=0.42:start_mode=clone,trim=duration=${D},setpts=PTS-STARTPTS,scale=iw*1.06:ih*1.06,crop=1920:1080,colorchannelmixer=rr=1.15:gg=0.45:bb=0.45,gblur=sigma=2[g];"
FC+="[a][g]blend=all_mode=screen:all_opacity=0.24[ag];"
# grade
FC+="[ag]eq=contrast=1.26:saturation=1.32:gamma=0.90,colorbalance=rs=-0.04:gs=0.0:bs=0.10:rm=0.06:gm=-0.01:bm=-0.04:rh=0.09:gh=-0.02:bh=-0.05,curves=all='0/0 0.10/0.02 0.5/0.48 1/1'[gr];"
# halation from the brightest parts, crimson
FC+="[h0]curves=all='0/0 0.70/0 1/1',gblur=sigma=22,colorchannelmixer=rr=1.0:gg=0.25:bb=0.22[halo];"
FC+="[gr][halo]blend=all_mode=screen:all_opacity=0.65[v1];"
# infernal under-light: a red gradient from the bottom edge
FC+="color=c=black:s=1920x1080:r=24:d=${D},format=gbrp,geq=r='255*pow(max(0\,(Y-H*0.45)/(H*0.55))\,1.6)*0.85':g='18*pow(max(0\,(Y-H*0.45)/(H*0.55))\,1.6)':b='22*pow(max(0\,(Y-H*0.45)/(H*0.55))\,1.6)'[under];"
FC+="[v1][under]blend=all_mode=screen:all_opacity=0.55[v2];"
# heartbeat: brightness + vignette pulse; chromatic split; grain; afterimage
FC+="[v2]format=yuv420p,eq=brightness='0.035*(${BEAT})-0.02':eval=frame,vignette=angle='PI/3.4-0.14*(${BEAT})':eval=frame,"
FC+="rgbashift=rh=-3:bh=3,noise=alls=10:allf=t,lagfun=decay=0.6,format=yuv420p[v]"
"$FB/ffmpeg.exe" -v error -y -i "$IN" -filter_complex "$FC" -map "[v]" -t "$D" -an -c:v libx264 -preset slow -crf 14 -pix_fmt yuv420p "$OUT"
echo "$OUT"
