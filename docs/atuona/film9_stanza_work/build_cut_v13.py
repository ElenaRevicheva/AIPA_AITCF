"""11 Oct 2026: the v13 cut of Atuona film #9 = the published v12 + Elena's edit of the evening:
  - THE DANCE (Arearea v4 clip vkD1) after M5 (Mila on the window seat): its first 0.8 s cut ("head looks not in place"), the rest
    whole, native speed (a dance), flowing glitch, no line
  - the lingerie frame (kS3) as a short 0.9 s glitch flash right after the dance (she did not say where)
  - the Arearea gallery shot (sm_kA1_ghost) REPLACES the picture of 1a (the empty wall): much shorter, starting as the painting's
    ghost already rises (ss 6.6 s), same length as 1a, flowing glitch; 1a keeps its stanza (#092 "What about the painting?" she
    asked. "Paradise?") and its voice
  - shorter: 15 (the cage) 6.52 -> 5.0 s, 16b (hands locking the clasp) 9.0 -> 5.0 s, 31 (Kira and Ule sitting on the bed) 7.51 -> 6.0 s
  - every other shot keeps its v12 length; line starts re-planned so >= 1 s of silence precedes every next line (<= x1.15 speed)
Writes cut_v13_2026-10-11.json + plan_v13.json (+ v13_reseg.txt). Run from the repo root:
  python docs/atuona/film9_stanza_work/build_cut_v13.py <render_v12 dir>"""
import json, subprocess, sys
FB = 'C:/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32/ffprobe.exe'
R12 = sys.argv[1]
W = 'docs/atuona/film9_stanza_work'
cut = json.load(open(f'{W}/cut_v12_2026-10-11.json', encoding='utf-8'))
t12 = {t['shot']: t for t in json.load(open(f'{R12}/work/timeline.json', encoding='utf-8'))}
dur = lambda f: float(subprocess.run([FB, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
# the ORIGINAL (unsped) takes: render_v12/vo/_orig holds the three that v12 sped up, the rest are originals in vo/
import os
V = {}
for s in t12:
    o = f'{R12}/vo/_orig/{s}.mp3'
    if os.path.exists(o): V[s] = dur(o)
    elif os.path.exists(f'{R12}/vo/{s}.mp3'): V[s] = dur(f'{R12}/vo/{s}.mp3')
NEW_D = {'15': 5.0, '16b': 5.0, '31': 6.0}
DANCE_SS, DANCE_SRC = 0.8, 10.0417
items = []
for it in cut['items']:
    it = dict(it)
    if it.get('sid') == '1a':
        it.update({'clip': '../stillclips/sm_kA1_ghost.mp4', 'ss': 6.6, 'slow': 1.0, 'glitchy': 'flow',
                   'qc': 'Elena 11 Oct: the Arearea gallery shot replaces the empty wall, from the rising ghost; 1a keeps its stanza and voice'})
    if it.get('sid') in NEW_D:
        it['edit'] = NEW_D[it['sid']]
    items.append(it)
    if it.get('sid') == 'M5':
        items.append({'sid': 'D1', 'clip': 'vkD1__venice-kling-o3-pro.mp4', 'ss': DANCE_SS, 'slow': 1.0, 'glitchy': 'flow',
                      'edit': round(DANCE_SRC - DANCE_SS - 0.06, 2), 'planned_edit': round(DANCE_SRC - DANCE_SS - 0.06, 2),
                      'qc': 'Elena 11 Oct: Arearea v4, the dance, after Mila on the window seat; first 0.8 s cut'})
        items.append({'sid': 'g_kS3', 'glitch_only': 'kS3.jpg', 'glitch_dur': 0.9})
# ---- line timing: the same rules as v12 over the NEW sequence (shot -> shot 1.3 s dissolve, anything with a flash 0.1 s cut)
G, LMIN, TMIN, MAXF, XF, GX = 1.0, 0.35, 0.35, 1.15, 1.3, 0.1
seq = []
for it in items:
    if it.get('glitch_only'): seq.append(('flash', it['sid'], it.get('glitch_dur', 1.2)))
    elif 'clip' in it: seq.append(('shot', it['sid'], it['edit'] if it['sid'] in NEW_D or it['sid'] == 'D1' else t12[it['sid']]['dur']))
    if it.get('glitch_after'): seq.append(('flash', it['sid'] + '_after', 1.2))
start, t = {}, 0.0
for k, (kind, sid, d) in enumerate(seq):
    if k:
        pk = seq[k - 1][0]
        t += seq[k - 1][2] - (GX if 'flash' in (kind, pk) else XF)
    start[sid] = t
d_of = {sid: d for kind, sid, d in seq if kind == 'shot'}
voiced = [sid for kind, sid, d in seq if kind == 'shot' and sid in V and any(i.get('sid') == sid and i.get('stanza') for i in items)]
lead = {s: 0.5 for s in voiced}; f = {s: 1.0 for s in voiced}
L = lambda s: V[s] / f[s]
end = lambda s: start[s] + lead[s] + L(s)
gap = lambda a, b: start[b] + lead[b] - end(a)
prev = {b: a for a, b in zip(voiced, voiced[1:])}
for s in voiced:   # a shortened shot must first hold its own line
    need = LMIN + V[s] + TMIN
    if d_of[s] < need: f[s] = min(MAXF, V[s] / (d_of[s] - LMIN - TMIN))
    lead[s] = max(LMIN, min(lead[s], d_of[s] - TMIN - L(s)))   # and start early enough to end inside the shorter shot
for a, b in zip(voiced, voiced[1:]):
    deficit = G - gap(a, b)
    if deficit <= 0: continue
    step = min(deficit, max(0.0, d_of[b] - TMIN - L(b) - lead[b])); lead[b] += step; deficit -= step
    if deficit > 1e-6:
        slack = (gap(prev[a], a) - G) if a in prev else (lead[a] - LMIN)
        step = min(deficit, max(0.0, lead[a] - LMIN), max(0.0, slack)); lead[a] -= step; deficit -= step
    for s in (b, a):
        if deficit <= 1e-6: break
        fs = min(MAXF, V[s] / max(L(s) - deficit, 0.1)); saved = L(s) - V[s] / fs; f[s] = fs; deficit -= saved
        if s == b: lead[b] += saved
    if deficit > 1e-6: print(f'  {a}->{b}: still {deficit:.2f}s short')
for s in voiced:
    assert lead[s] >= LMIN - 1e-6 and lead[s] + L(s) <= d_of[s] - TMIN + 1e-6, (s, lead[s], L(s), d_of[s])
plan = {s: {'edit': d_of[s], 'lead': round(lead[s], 2), 'f': round(f[s], 3), 'line': round(L(s), 2)} for s in voiced}
for it in items:
    if 'clip' in it and it['sid'] in plan:
        it['edit'] = plan[it['sid']]['edit']; it['lead'] = plan[it['sid']]['lead']
        if plan[it['sid']]['f'] > 1.001: it['voice_speed'] = plan[it['sid']]['f']
        else: it.pop('voice_speed', None)
cut['items'] = items
cut['_note'] = "v13, 11 Oct 2026: v12 + dance after M5, lingerie flash, Arearea replaces 1a's picture, 15/16b/31 shorter; see build_cut_v13.py"
json.dump(cut, open(f'{W}/cut_v13_2026-10-11.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
json.dump(plan, open(f'{W}/plan_v13.json', 'w'), indent=1)
pz = [gap(a, b) for a, b in zip(voiced, voiced[1:])]
v12lead = {i['sid']: (i.get('lead', 0.5), i.get('voice_speed', 1.0)) for i in json.load(open(f'{W}/cut_v12_2026-10-11.json', encoding='utf-8'))['items'] if 'clip' in i}
reseg = [s for s in plan if s in NEW_D or s == '1a' or abs(plan[s]['lead'] - v12lead[s][0]) > 0.005 or abs(plan[s]['f'] - v12lead[s][1]) > 0.002] + ['D1']
open(f'{W}/v13_reseg.txt', 'w').write(','.join(reseg))
print(f'shortest pause {min(pz):.2f}s; sped: ' + ', '.join(f'{s} x{plan[s]["f"]:.2f}' for s in plan if plan[s]['f'] > 1.001))
print('re-render:', ','.join(reseg))
