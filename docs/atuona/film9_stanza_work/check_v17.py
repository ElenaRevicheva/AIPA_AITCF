"""12 Oct 2026: prove the v17 build of AREAREA = the published v16 with ONLY: a new whole stanza on 10a (#093, no "morning" right
after 9's morning), and the closing card AREAREA + the art-history note. Nothing else touched.
Usage (repo root): python docs/atuona/film9_stanza_work/check_v17.py <render_v16 dir> <render_v17 dir>"""
import json, subprocess, sys, filecmp, os
FB = 'C:/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32/ffprobe.exe'
R16, R17 = sys.argv[1], sys.argv[2]
W = 'docs/atuona/film9_stanza_work'
t16 = {t['shot']: t for t in json.load(open(f'{R16}/work/timeline.json', encoding='utf-8'))}
tl = json.load(open(f'{R17}/work/timeline.json', encoding='utf-8')); t17 = {t['shot']: t for t in tl}
c16 = {i['sid']: i for i in json.load(open(f'{W}/cut_v16_2026-10-11.json', encoding='utf-8'))['items']}
cut = json.load(open(f'{W}/cut_v17_2026-10-12.json', encoding='utf-8')); c17 = {i['sid']: i for i in cut['items']}
inv = {s['id']: s for s in json.load(open(f'{W}/v6_stanza_inventory.json', encoding='utf-8'))}
dur = lambda f: float(subprocess.run([FB, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
ok = True
def check(c, m):
    global ok
    print(('PASS ' if c else 'FAIL ') + m); ok = ok and c
same = [s for s in t16 if abs(t17[s]['dur'] - t16[s]['dur']) < 0.02]
check(len(same) == len(t16) == len(t17), f'{len(same)}/{len(t16)} shots exactly as long as in the published v16')
check(c17['10a']['stanza'] == inv['S093.24']['text'] and c17['10a']['poem'] == '#093', '10a says "Paradise is not painted. / Paradise is compiled. / One brushstroke at a time." (#093)')
voiced = [i for i in cut['items'] if i.get('stanza') and 'clip' in i]
pairs = [(a['sid'], b['sid']) for a, b in zip(voiced, voiced[1:]) if 'morning' in a['stanza'].lower() and 'morning' in b['stanza'].lower()]
check(not pairs, f'no two stanzas in a row say "morning" {pairs or ""}')
check(all(c17[s].get('stanza') == c16[s].get('stanza') and c17[s].get('poem') == c16[s].get('poem') for s in c16 if s != '10a'), 'every other stanza and number unchanged')
check(list(c16) == list(c17), 'same items in the same order')
quoted = []
for i in cut['items']:
    n = i.get('poem', '')[1:]
    if n and n not in quoted: quoted.append(n)
check([l['num'] for l in cut['poem_links']] == quoted, f"end card lists exactly the {len(quoted)} fragments quoted")
v = [t for t in tl if t.get('vo_at') is not None]
vd = {t['shot']: dur(f'{R17}/vo/{t["shot"]}.mp3') for t in v}
pz = [(a['shot'], b['shot'], b['vo_at'] - a['vo_at'] - vd[a['shot']]) for a, b in zip(v, v[1:])]
w = min(pz, key=lambda p: p[2])
check(w[2] >= 0.85, f'shortest silence before a next line {w[2]:.2f} s ({w[0]} -> {w[1]})')
check(t17['10a']['vo_at'] + vd['10a'] <= t17['10a']['start'] + t17['10a']['dur'] if 'start' in t17['10a'] else True, '10a line ends inside its shot')
reused = [f for f in os.listdir(f'{R16}/work') if f.startswith('seg_') and f[4:-4] != '10a' and filecmp.cmp(f'{R16}/work/{f}', f'{R17}/work/{f}', shallow=False)]
check(len(reused) == len(t16) - 1, f'{len(reused)} reused segments byte-identical to v16')
title = open(f'{R17}/work/card_outro.mp4_t.txt', encoding='utf-8').read()
notes = [open(f'{R17}/work/card_outro.mp4_n{k}.txt', encoding='utf-8').read() for k in range(len(cut['outro']['note']))]
check(title.replace(' ', '') == 'AREAREA' and notes == cut['outro']['note'], f'closing card reads "{title}" + {len(notes)} note lines')
check(abs(dur(f'{R17}/work/card_outro.mp4') - cut['outro']['dur']) < 0.1, f"closing card {dur(f'{R17}/work/card_outro.mp4'):.1f} s")
check(abs(dur(f'{R17}/work/final.mp4') - (dur(f'{R16}/work/final.mp4') + cut['outro']['dur'] - 4.2)) < 0.3, f"film {dur(f'{R16}/work/final.mp4'):.1f} -> {dur(f'{R17}/work/final.mp4'):.1f} s (only the closing card longer)")
print('ALL PASS' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
