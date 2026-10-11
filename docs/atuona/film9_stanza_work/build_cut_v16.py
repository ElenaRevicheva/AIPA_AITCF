"""11 Oct 2026: the v16 cut of film #9 AREAREA = the published v15 + Elena:
  "Make shot with Mila and blue sand little bit shorter but still video visible and Ule and Kira on bed little shorter - you can
   choose another stanza, shorter one. And change stanza that finishes with Panamanian morning. We are talking about Atuona, not Panama."
  - M4 (Mila, the blue sand): 6.0 -> 4.5 s at natural speed (the pour stays a moving process)
  - 31 (Kira and Ule on the bed): 5.6 -> 4.2 s, new whole stanza S083.17 "The air between them thickens." (#083, her words)
  - 9 (Kira breathes in the morning mist): new whole stanza S068.1 "Morning in Atuona doesn't begin with light. / It begins with
    scent." (#068) instead of #065's "...a Panamanian morning."
  - the end card lists the fragments actually quoted (#065 leaves, 20 fragments); the intro count follows
  - every other shot keeps its v15 length; line starts re-planned (~1 s pause before every next line)
New takes for 9 and 31 (onyx, tts-1 0.9) in render_v16/vo_new. Run from the repo root:
  python docs/atuona/film9_stanza_work/build_cut_v16.py <render_v12 dir> <render_v15 dir> <render_v16 dir>"""
import json, os, subprocess, sys
FB = 'C:/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32/ffprobe.exe'
R12, R15, R16 = sys.argv[1], sys.argv[2], sys.argv[3]
W = 'docs/atuona/film9_stanza_work'
cut = json.load(open(f'{W}/cut_v15_2026-10-11.json', encoding='utf-8'))
t15 = {t['shot']: t for t in json.load(open(f'{R15}/work/timeline.json', encoding='utf-8'))}
p14 = json.load(open(f'{W}/plan_v14.json'))
inv = {s['id']: s for s in json.load(open(f'{W}/v6_stanza_inventory.json', encoding='utf-8'))}
site = {p['id']: p['title'] for p in json.load(open('docs/atuona/poems_src/poems_github_2026-10-08.json', encoding='utf-8'))}
dur = lambda f: float(subprocess.run([FB, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
NEW_STANZA = {'9': 'S068.1', '31': 'S083.17'}
NEW_D = {'M4': 4.5, '31': 4.2}
V = {}
for s in p14:
    if s in NEW_STANZA: V[s] = dur(f'{R16}/vo_new/{s}.mp3')
    else:
        o = f'{R12}/vo/_orig/{s}.mp3'; V[s] = dur(o if os.path.exists(o) else f'{R12}/vo/{s}.mp3')
items = []
for it in cut['items']:
    it = dict(it)
    sid = it.get('sid')
    if sid in NEW_STANZA:
        st = inv[NEW_STANZA[sid]]
        it.update({'stanza': st['text'], 'poem': '#' + st['poem'], 'stanza_id': st['id']})
    if sid == 'M4':
        it.update({'edit': NEW_D['M4'], 'slow': 1.0, 'ss': 0.25, 'planned_edit': NEW_D['M4']})
    elif sid in NEW_D:
        it['edit'] = NEW_D[sid]
    items.append(it)
G, LMIN, TMIN, MAXF, XF, GX = 1.0, 0.35, 0.35, 1.15, 1.3, 0.1
seq = []
for it in items:
    if it.get('glitch_only'): seq.append(('flash', it['sid'], it.get('glitch_dur', 1.2)))
    elif 'clip' in it: seq.append(('shot', it['sid'], NEW_D.get(it['sid'], t15[it['sid']]['dur'])))
    if it.get('glitch_after'): seq.append(('flash', it['sid'] + '_after', 1.2))
start, t = {}, 0.0
for k, (kind, sid, d) in enumerate(seq):
    if k: t += seq[k - 1][2] - (GX if 'flash' in (kind, seq[k - 1][0]) else XF)
    start[sid] = t
d_of = {sid: d for kind, sid, d in seq if kind == 'shot'}
voiced = [sid for kind, sid, d in seq if kind == 'shot' and sid in V]
lead = {s: p14[s]['lead'] for s in voiced}
f = {s: (1.0 if s in NEW_STANZA else max(1.0, p14[s]['f'])) for s in voiced}
L = lambda s: V[s] / f[s]
end = lambda s: start[s] + lead[s] + L(s)
gap = lambda a, b: start[b] + lead[b] - end(a)
prev = {b: a for a, b in zip(voiced, voiced[1:])}
for s in voiced:
    if d_of[s] < LMIN + L(s) + TMIN: f[s] = min(MAXF, V[s] / (d_of[s] - LMIN - TMIN))
    lead[s] = max(LMIN, min(lead[s] if s not in NEW_STANZA else 0.5, d_of[s] - TMIN - L(s)))
for a, b in zip(voiced, voiced[1:]):
    deficit = G - gap(a, b)
    if deficit <= 0: continue
    step = min(deficit, max(0.0, d_of[b] - TMIN - L(b) - lead[b])); lead[b] += step; deficit -= step
    if deficit > 1e-6:
        slack = (gap(prev[a], a) - G) if a in prev else (lead[a] - LMIN)
        step = min(deficit, max(0.0, lead[a] - LMIN), max(0.0, slack)); lead[a] -= step; deficit -= step
    for s in (b, a):
        if deficit <= 1e-6: break
        fs = min(MAXF, V[s] / max(L(s) - deficit, 0.1)); saved = L(s) - V[s] / fs; f[s] = max(f[s], fs); deficit -= saved
        if s == b: lead[b] += saved
    if deficit > 1e-6: print(f'  {a}->{b}: still {deficit:.2f}s short')
for s in voiced:
    assert lead[s] >= LMIN - 1e-6 and lead[s] + L(s) <= d_of[s] - TMIN + 1e-6, (s, lead[s], L(s), d_of[s])
plan = {s: {'edit': d_of[s], 'lead': round(lead[s], 2), 'f': round(f[s], 3), 'line': round(L(s), 2), 'new_take': s in NEW_STANZA} for s in voiced}
for it in items:
    if 'clip' in it and it['sid'] in plan:
        it['edit'] = plan[it['sid']]['edit']; it['lead'] = plan[it['sid']]['lead']
        if plan[it['sid']]['f'] > 1.001: it['voice_speed'] = plan[it['sid']]['f']
        else: it.pop('voice_speed', None)
seen, links = set(), []
for it in items:
    n = it.get('poem', '')[1:]
    if n and n not in seen:
        seen.add(n); links.append({'num': n, 'title': site.get(n, inv.get(it.get('stanza_id', ''), {}).get('title', ''))})
cut['items'] = items
cut['poem_links'] = links
cut['poems_atuona'] = ' '.join('#' + l['num'] for l in sorted(links, key=lambda l: l['num']))
cut['moments'] = cut['moments'].split('\n')[0] + f'\n{len(links)} fragments  \u00b7  ATUONA'
cut['_note'] = "v16, 11 Oct 2026: v15 + M4/31 shorter, new stanzas on 9 (#068, Atuona) and 31 (#083); see build_cut_v16.py"
json.dump(cut, open(f'{W}/cut_v16_2026-10-11.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
json.dump(plan, open(f'{W}/plan_v16.json', 'w'), indent=1)
reseg = sorted({'9', '31', 'M4'} | {s for s in plan if abs(plan[s]['lead'] - p14[s]['lead']) > 0.005 or abs(plan[s]['f'] - p14[s]['f']) > 0.002})
open(f'{W}/v16_reseg.txt', 'w').write(','.join(reseg))
pz = [gap(a, b) for a, b in zip(voiced, voiced[1:])]
print(f'{len(links)} fragments on the end card; shortest pause {min(pz):.2f}s; 9: {plan["9"]}; 31: {plan["31"]}; re-render: {",".join(reseg)}')
