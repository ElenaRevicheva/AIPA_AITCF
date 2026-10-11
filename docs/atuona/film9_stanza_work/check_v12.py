"""11 Oct 2026: prove the v12 build of film #9 = the published v10 with only Elena's two edits:
  1. every shot exactly as long as in v10 (except M4) - "do not touch video length"
  2. at least ~1 s of silence before every next voice line - "make a little pause"
  3. M4 (Mila, blue sand) is a moving shot of ~6 s with the flowing glitch, no longer a 0.9 s flash
plus everything check_v10 proves (run it too) and the typed text (typed_check.py).
Usage (repo root): python docs/atuona/film9_stanza_work/check_v12.py <render_v10 dir> <render_v12 dir>"""
import json, subprocess, sys
FB = 'C:/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32/ffprobe.exe'
R10, R12 = sys.argv[1], sys.argv[2]
t10 = {t['shot']: t for t in json.load(open(f'{R10}/work/timeline.json', encoding='utf-8'))}
tl = json.load(open(f'{R12}/work/timeline.json', encoding='utf-8'))
t12 = {t['shot']: t for t in tl}
cut = json.load(open('docs/atuona/film9_stanza_work/cut_v12_2026-10-11.json', encoding='utf-8'))
dur = lambda f: float(subprocess.run([FB, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
ok = True
def check(c, msg):
    global ok
    print(('PASS ' if c else 'FAIL ') + msg); ok = ok and c
same = [s for s in t10 if abs(t12[s]['dur'] - t10[s]['dur']) < 0.02]
check(len(same) == len(t10), f'{len(same)}/{len(t10)} shots exactly as long as in the published v10' + ('' if len(same) == len(t10) else f' (differ: {[s for s in t10 if s not in same]})'))
check('M4' in t12 and abs(t12['M4']['dur'] - 6.0) < 0.05 and t12['M4']['clip'] == 'vM4__venice-kling-o3-pro.mp4', f"M4 is a moving shot of {t12.get('M4', {}).get('dur')} s on vM4")
check(not [i for i in cut['items'] if i.get('sid') == 'g_M4'], 'the 0.9 s M4 flash is gone')
check(all(i.get('glitchy') == 'flow' for i in cut['items'] if 'clip' in i), 'every moving shot (M4 too) carries the flowing glitch')
lead = {i['sid']: i.get('lead', 0.5) for i in cut['items'] if 'clip' in i}
for t in tl:   # where the MIX starts each line (the v12 build's timeline.json recorded the global 0.5 s)
    if t.get('vo_at') is not None: t['vo_at'] = round(t['start'] + lead[t['shot']], 2)
voiced = [t for t in tl if t.get('vo_at') is not None]
vd = {t['shot']: dur(f'{R12}/vo/{t["shot"]}.mp3') for t in voiced}
pauses = [(a['shot'], b['shot'], b['vo_at'] - a['vo_at'] - vd[a['shot']]) for a, b in zip(voiced, voiced[1:])]
worst = min(pauses, key=lambda p: p[2])
check(worst[2] >= 0.95, f'shortest silence before a next line: {worst[2]:.2f} s ({worst[0]} -> {worst[1]}); was 0.29 s in v10')
for s, t in t12.items():
    if t.get('vo_at') is not None:
        end_in_shot = t['vo_at'] + vd[s] - t['start']
        if end_in_shot > t['dur'] - 0.3:
            check(False, f'{s}: its line runs to {end_in_shot:.2f} s of a {t["dur"]} s shot')
print('ALL PASS' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
