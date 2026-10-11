"""11 Oct 2026: prove the v13 build of film #9 = the published v12 with ONLY Elena's edit of the evening (and nothing wiped):
  every v12 shot except 15/16b/31 keeps its length; 15/16b/31 got shorter; 1a = the Arearea gallery clip with 1a's stanza;
  the dance D1 right after M5 and the lingerie flash right after it; every v12 stanza and number unchanged; every moving shot
  glitchy; >= ~1 s of silence before every next line; reused segments byte-identical to v12.
Usage (repo root): python docs/atuona/film9_stanza_work/check_v13.py <render_v12 dir> <render_v13 dir>"""
import json, subprocess, sys, filecmp, os
FB = 'C:/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32/ffprobe.exe'
R12, R13 = sys.argv[1], sys.argv[2]
W = 'docs/atuona/film9_stanza_work'
t12 = {t['shot']: t for t in json.load(open(f'{R12}/work/timeline.json', encoding='utf-8'))}
tl = json.load(open(f'{R13}/work/timeline.json', encoding='utf-8')); t13 = {t['shot']: t for t in tl}
c12 = {i['sid']: i for i in json.load(open(f'{W}/cut_v12_2026-10-11.json', encoding='utf-8'))['items']}
cut = json.load(open(f'{W}/cut_v13_2026-10-11.json', encoding='utf-8')); c13 = {i['sid']: i for i in cut['items']}
order = [i['sid'] for i in cut['items']]
dur = lambda f: float(subprocess.run([FB, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
ok = True
def check(c, msg):
    global ok
    print(('PASS ' if c else 'FAIL ') + msg); ok = ok and c
CHANGED = {'15': 5.0, '16b': 5.0, '31': 6.0}
kept = [s for s in t12 if s not in CHANGED and abs(t13[s]['dur'] - t12[s]['dur']) < 0.02]
check(len(kept) == len(t12) - len(CHANGED), f'{len(kept)}/{len(t12) - len(CHANGED)} untouched shots exactly as long as in v12')
for s, d in CHANGED.items():
    check(abs(t13[s]['dur'] - d) < 0.05 and t13[s]['dur'] < t12[s]['dur'], f'{s} shorter: {t12[s]["dur"]} -> {t13[s]["dur"]} s')
check(t13['1a']['clip'] == '../stillclips/sm_kA1_ghost.mp4' and abs(t13['1a']['dur'] - t12['1a']['dur']) < 0.02, f"1a = the Arearea gallery clip, {t13['1a']['dur']} s (was the empty wall)")
check(order.index('D1') == order.index('M5') + 1 and order[order.index('D1') + 1] == 'g_kS3', 'the dance comes right after M5, the lingerie flash right after the dance')
check(c13['g_kS3'].get('glitch_dur') == 0.9, 'the lingerie flash is a short 0.9 s glitch')
check(abs(t13['D1']['dur'] - (10.0417 - 0.8 - 0.06)) < 0.06, f"the dance runs {t13['D1']['dur']} s (first 0.8 s cut)")
same_text = [s for s, i in c12.items() if i.get('stanza') and c13.get(s, {}).get('stanza') == i['stanza'] and c13[s].get('poem') == i.get('poem')]
check(len(same_text) == sum(1 for i in c12.values() if i.get('stanza')), f'{len(same_text)} stanzas and fragment numbers unchanged from v12')
check(set(c12) - {'g_M4'} <= set(c13), 'no v12 item removed')
check(all(i.get('glitchy') == 'flow' for i in cut['items'] if 'clip' in i), 'every moving shot (1a, the dance too) carries the flowing glitch')
voiced = [t for t in tl if t.get('vo_at') is not None]
vd = {t['shot']: dur(f'{R13}/vo/{t["shot"]}.mp3') for t in voiced}
pz = [(a['shot'], b['shot'], b['vo_at'] - a['vo_at'] - vd[a['shot']]) for a, b in zip(voiced, voiced[1:])]
w = min(pz, key=lambda p: p[2])
check(w[2] >= 0.95, f'shortest silence before a next line {w[2]:.2f} s ({w[0]} -> {w[1]})')
for t in voiced:
    if t['vo_at'] + vd[t['shot']] - t['start'] > t['dur'] - 0.3: check(False, f"{t['shot']}: its line overruns its shot")
reused = [f for f in os.listdir(f'{R12}/work') if f.startswith('seg_') and os.path.exists(f'{R13}/work/{f}') and filecmp.cmp(f'{R12}/work/{f}', f'{R13}/work/{f}', shallow=False)]
resegs = open(f'{W}/v13_reseg.txt').read().split(',')
check(len(reused) == len([s for s in t12 if s not in resegs]), f'{len(reused)} reused segments byte-identical to v12')
print('ALL PASS' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
