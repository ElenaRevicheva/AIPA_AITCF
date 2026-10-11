"""11 Oct 2026: prove the v14 build of film #9 = v13 with ONLY 24b regraded and 31 shortened (nothing else touched).
Usage (repo root): python docs/atuona/film9_stanza_work/check_v14.py <render_v13 dir> <render_v14 dir>"""
import json, subprocess, sys, filecmp, os
FB = 'C:/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32/ffprobe.exe'
R13, R14 = sys.argv[1], sys.argv[2]
W = 'docs/atuona/film9_stanza_work'
t13 = {t['shot']: t for t in json.load(open(f'{R13}/work/timeline.json', encoding='utf-8'))}
tl = json.load(open(f'{R14}/work/timeline.json', encoding='utf-8')); t14 = {t['shot']: t for t in tl}
c13 = {i['sid']: i for i in json.load(open(f'{W}/cut_v13_2026-10-11.json', encoding='utf-8'))['items']}
c14 = {i['sid']: i for i in json.load(open(f'{W}/cut_v14_2026-10-11.json', encoding='utf-8'))['items']}
dur = lambda f: float(subprocess.run([FB, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
ok = True
def check(c, m):
    global ok
    print(('PASS ' if c else 'FAIL ') + m); ok = ok and c
same = [s for s in t13 if s != '31' and abs(t14[s]['dur'] - t13[s]['dur']) < 0.02]
check(len(same) == len(t13) - 1, f'{len(same)}/{len(t13) - 1} shots exactly as long as in v13')
check(abs(t14['31']['dur'] - 5.6) < 0.05 and t14['31']['dur'] < t13['31']['dur'], f"31 (the bed) {t13['31']['dur']} -> {t14['31']['dur']} s")
check(t14['24b']['clip'] == 'v24Lb_graded.mp4' and abs(t14['24b']['dur'] - t13['24b']['dur']) < 0.02, '24b plays the regraded clip, same length')
check(list(c13) == list(c14), 'same items in the same order as v13')
check(all(c14[s].get('stanza') == c13[s].get('stanza') and c14[s].get('poem') == c13[s].get('poem') for s in c13), 'every stanza and fragment number unchanged')
voiced = [t for t in tl if t.get('vo_at') is not None]
vd = {t['shot']: dur(f'{R14}/vo/{t["shot"]}.mp3') for t in voiced}
pz = [(a['shot'], b['shot'], b['vo_at'] - a['vo_at'] - vd[a['shot']]) for a, b in zip(voiced, voiced[1:])]
w = min(pz, key=lambda p: p[2])
check(w[2] >= 0.85, f'shortest silence before a next line {w[2]:.2f} s ({w[0]} -> {w[1]})')
for t in voiced:
    if t['vo_at'] + vd[t['shot']] - t['start'] > t['dur'] - 0.2: check(False, f"{t['shot']}: its line overruns its shot")
resegs = open(f'{W}/v14_reseg.txt').read().split(',')
reused = [f for f in os.listdir(f'{R13}/work') if f.startswith('seg_') and f[4:-4] not in resegs and filecmp.cmp(f'{R13}/work/{f}', f'{R14}/work/{f}', shallow=False)]
check(len(reused) == len([s for s in t13 if s not in resegs]), f'{len(reused)} reused segments byte-identical to v13')
print('ALL PASS' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
