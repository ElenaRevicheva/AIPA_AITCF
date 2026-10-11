"""11 Oct 2026: measure the silence between consecutive voice lines of a film #9 build (Elena: "there is absolutely no pause
between each stanza reading"). Reads <WORK>/work/timeline.json (vo_at = where each line starts) and the voice files.
Usage (repo root): python docs/atuona/film9_stanza_work/voice_gaps.py <WORK dir> <vo dir>"""
import json, subprocess, sys
FB = 'C:/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32/ffprobe.exe'
WORK, VO = sys.argv[1], sys.argv[2]
tl = json.load(open(f'{WORK}/work/timeline.json', encoding='utf-8'))
dur = lambda f: float(subprocess.run([FB, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
vd = {t['shot']: dur(f'{VO}/{t["shot"]}.mp3') for t in tl if t.get('vo_at') is not None}
gaps = []
for a, b in zip(tl, tl[1:]):
    if a['shot'] not in vd or b['shot'] not in vd: continue
    g = b['vo_at'] - (a['vo_at'] + vd[a['shot']]); gaps.append(g)
    print(f"{a['shot']:4} -> {b['shot']:4}  shot {a['dur']:5.2f}s  line {vd[a['shot']]:4.1f}s  silence before next line {g:5.2f}s")
s = sorted(gaps)
print(f'silences: min {s[0]:.2f}s, median {s[len(s)//2]:.2f}s, max {s[-1]:.2f}s')
