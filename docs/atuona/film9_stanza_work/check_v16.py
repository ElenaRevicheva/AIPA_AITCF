"""11 Oct 2026: prove the v16 build of AREAREA = the published v15 with ONLY: M4 and 31 shorter, new whole stanzas on 9 (#068 Atuona)
and 31 (#083), and an end card listing exactly the fragments quoted. Nothing else touched.
Usage (repo root): python docs/atuona/film9_stanza_work/check_v16.py <render_v15 dir> <render_v16 dir>"""
import json, subprocess, sys, filecmp, os
FB = 'C:/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32/ffprobe.exe'
R15, R16 = sys.argv[1], sys.argv[2]
W = 'docs/atuona/film9_stanza_work'
t15 = {t['shot']: t for t in json.load(open(f'{R15}/work/timeline.json', encoding='utf-8'))}
tl = json.load(open(f'{R16}/work/timeline.json', encoding='utf-8')); t16 = {t['shot']: t for t in tl}
c15 = {i['sid']: i for i in json.load(open(f'{W}/cut_v15_2026-10-11.json', encoding='utf-8'))['items']}
cut = json.load(open(f'{W}/cut_v16_2026-10-11.json', encoding='utf-8')); c16 = {i['sid']: i for i in cut['items']}
inv = {s['id']: s for s in json.load(open(f'{W}/v6_stanza_inventory.json', encoding='utf-8'))}
dur = lambda f: float(subprocess.run([FB, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
ok = True
def check(c, m):
    global ok
    print(('PASS ' if c else 'FAIL ') + m); ok = ok and c
same = [s for s in t15 if s not in ('M4', '31') and abs(t16[s]['dur'] - t15[s]['dur']) < 0.02]
check(len(same) == len(t15) - 2, f'{len(same)}/{len(t15) - 2} shots exactly as long as in the published v15')
check(abs(t16['M4']['dur'] - 4.5) < 0.05, f"M4 (Mila, blue sand) {t15['M4']['dur']} -> {t16['M4']['dur']} s, moving clip {t16['M4']['clip']}")
check(abs(t16['31']['dur'] - 4.2) < 0.05, f"31 (the bed) {t15['31']['dur']} -> {t16['31']['dur']} s")
check(c16['9']['stanza'] == inv['S068.1']['text'] and c16['9']['poem'] == '#068' and 'Panam' not in c16['9']['stanza'], '9 says "Morning in Atuona doesn\'t begin with light. / It begins with scent." (#068)')
check(c16['31']['stanza'] == inv['S083.17']['text'] and c16['31']['poem'] == '#083', '31 says "The air between them thickens." (#083)')
other = [s for s in c15 if s not in ('9', '31')]
check(all(c16[s].get('stanza') == c15[s].get('stanza') and c16[s].get('poem') == c15[s].get('poem') for s in other), 'every other stanza and number unchanged')
check(list(c15) == list(c16), 'same items in the same order')
quoted = []
for i in cut['items']:
    n = i.get('poem', '')[1:]
    if n and n not in quoted: quoted.append(n)
check([l['num'] for l in cut['poem_links']] == quoted, f"end card lists exactly the {len(quoted)} fragments quoted")
voiced = [t for t in tl if t.get('vo_at') is not None]
vd = {t['shot']: dur(f'{R16}/vo/{t["shot"]}.mp3') for t in voiced}
pz = [(a['shot'], b['shot'], b['vo_at'] - a['vo_at'] - vd[a['shot']]) for a, b in zip(voiced, voiced[1:])]
w = min(pz, key=lambda p: p[2])
check(w[2] >= 0.85, f'shortest silence before a next line {w[2]:.2f} s ({w[0]} -> {w[1]})')
resegs = open(f'{W}/v16_reseg.txt').read().split(',')
reused = [f for f in os.listdir(f'{R15}/work') if f.startswith('seg_') and f[4:-4] not in resegs and filecmp.cmp(f'{R15}/work/{f}', f'{R16}/work/{f}', shallow=False)]
check(len(reused) == len([s for s in t15 if s not in resegs]), f'{len(reused)} reused segments byte-identical to v15')
print('ALL PASS' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
