"""11 Oct 2026: the v14 cut of Atuona film #9 = v13 + Elena's approved touch-ups:
  - 24b (Ule's tear -> the auction lots): the regraded clip v24Lb_graded.mp4 (arearea/grade_24b.sh: split tone, crimson under-light,
    halation, the delayed red 'other Ule', heartbeat) - same length, same stanza, same line
  - 31 (Kira and Ule on the bed): 6.0 -> 5.6 s, the shortest that still speaks its whole stanza (<= x1.15, 0.25 s in/out margins)
  - every other shot keeps its v13 length; line starts re-planned so ~1 s of silence precedes every next line
Writes cut_v14_2026-10-11.json + plan_v14.json + v14_reseg.txt. Run from the repo root:
  python docs/atuona/film9_stanza_work/build_cut_v14.py <render_v12 dir> <render_v13 dir>"""
import json, os, subprocess, sys
FB = 'C:/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32/ffprobe.exe'
R12, R13 = sys.argv[1], sys.argv[2]
W = 'docs/atuona/film9_stanza_work'
cut = json.load(open(f'{W}/cut_v13_2026-10-11.json', encoding='utf-8'))
t13 = {t['shot']: t for t in json.load(open(f'{R13}/work/timeline.json', encoding='utf-8'))}
p13 = json.load(open(f'{W}/plan_v13.json'))
dur = lambda f: float(subprocess.run([FB, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
V = {}   # the ORIGINAL (unsped) takes
for s in p13:
    o = f'{R12}/vo/_orig/{s}.mp3'
    V[s] = dur(o if os.path.exists(o) else f'{R12}/vo/{s}.mp3')
NEW_D = {'31': 5.6}
MARGIN = {'31': 0.25}            # 31 alone: 0.25 s before and after its line (others 0.35)
items = []
for it in cut['items']:
    it = dict(it)
    if it.get('sid') == '24b':
        it['clip'] = 'v24Lb_graded.mp4'
        it['qc'] = 'Elena 11 Oct: regraded on the laptop (grade_24b.sh) - pain, sexual energy, devilish beauty'
    if it.get('sid') in NEW_D:
        it['edit'] = NEW_D[it['sid']]
    items.append(it)
G, LMIN, TMIN, MAXF, XF, GX = 1.0, 0.35, 0.35, 1.15, 1.3, 0.1
seq = []
for it in items:
    if it.get('glitch_only'): seq.append(('flash', it['sid'], it.get('glitch_dur', 1.2)))
    elif 'clip' in it: seq.append(('shot', it['sid'], NEW_D.get(it['sid'], t13[it['sid']]['dur'])))
    if it.get('glitch_after'): seq.append(('flash', it['sid'] + '_after', 1.2))
start, t = {}, 0.0
for k, (kind, sid, d) in enumerate(seq):
    if k:
        t += seq[k - 1][2] - (GX if 'flash' in (kind, seq[k - 1][0]) else XF)
    start[sid] = t
d_of = {sid: d for kind, sid, d in seq if kind == 'shot'}
voiced = [sid for kind, sid, d in seq if kind == 'shot' and sid in V]
lmin = {s: MARGIN.get(s, LMIN) for s in voiced}; tmin = {s: MARGIN.get(s, TMIN) for s in voiced}
lead = {s: p13[s]['lead'] for s in voiced}; f = {s: max(1.0, p13[s]['f']) for s in voiced}
L = lambda s: V[s] / f[s]
end = lambda s: start[s] + lead[s] + L(s)
gap = lambda a, b: start[b] + lead[b] - end(a)
prev = {b: a for a, b in zip(voiced, voiced[1:])}
for s in voiced:
    if d_of[s] < lmin[s] + L(s) + tmin[s]:
        f[s] = min(MAXF, V[s] / (d_of[s] - lmin[s] - tmin[s]))
    lead[s] = max(lmin[s], min(lead[s], d_of[s] - tmin[s] - L(s)))
for a, b in zip(voiced, voiced[1:]):
    deficit = G - gap(a, b)
    if deficit <= 0: continue
    step = min(deficit, max(0.0, d_of[b] - tmin[b] - L(b) - lead[b])); lead[b] += step; deficit -= step
    if deficit > 1e-6:
        slack = (gap(prev[a], a) - G) if a in prev else (lead[a] - lmin[a])
        step = min(deficit, max(0.0, lead[a] - lmin[a]), max(0.0, slack)); lead[a] -= step; deficit -= step
    for s in (b, a):
        if deficit <= 1e-6: break
        fs = min(MAXF, V[s] / max(L(s) - deficit, 0.1)); saved = L(s) - V[s] / fs; f[s] = max(f[s], fs); deficit -= saved
        if s == b: lead[b] += saved
    if deficit > 1e-6: print(f'  {a}->{b}: still {deficit:.2f}s short')
for s in voiced:
    assert lead[s] >= lmin[s] - 1e-6 and lead[s] + L(s) <= d_of[s] - tmin[s] + 1e-6, (s, lead[s], L(s), d_of[s])
plan = {s: {'edit': d_of[s], 'lead': round(lead[s], 2), 'f': round(f[s], 3), 'line': round(L(s), 2)} for s in voiced}
for it in items:
    if 'clip' in it and it['sid'] in plan:
        it['edit'] = plan[it['sid']]['edit']; it['lead'] = plan[it['sid']]['lead']
        if plan[it['sid']]['f'] > 1.001: it['voice_speed'] = plan[it['sid']]['f']
        else: it.pop('voice_speed', None)
cut['items'] = items
cut['_note'] = "v14, 11 Oct 2026: v13 + regraded 24b + bed shot 31 at 5.6 s; see build_cut_v14.py"
json.dump(cut, open(f'{W}/cut_v14_2026-10-11.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
json.dump(plan, open(f'{W}/plan_v14.json', 'w'), indent=1)
reseg = sorted({'24b', '31'} | {s for s in plan if abs(plan[s]['lead'] - p13[s]['lead']) > 0.005 or abs(plan[s]['f'] - p13[s]['f']) > 0.002})
open(f'{W}/v14_reseg.txt', 'w').write(','.join(reseg))
pz = [gap(a, b) for a, b in zip(voiced, voiced[1:])]
print(f"31: {plan['31']}; shortest pause {min(pz):.2f}s; re-render: {','.join(reseg)}")
