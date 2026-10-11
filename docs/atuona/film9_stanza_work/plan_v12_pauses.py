"""11 Oct 2026: give every voice line a pause before the next (Elena: "there is absolutely no pause between each stanza reading -
make a little pause - but do not touch video length"). Every shot keeps its v10 length (pinned as its `edit`); only WHERE each
line starts inside its shot (`lead`) moves, and a line that still cannot fit is played a little faster (atempo, pitch kept,
at most MAXF). Also M4 (Mila, blue sand) becomes a moving shot again (M4_DUR s, no line): the gap M3 -> M5 grows by that.
One forward pass per junction a -> b, in this order of remedies:
  1. start b later (if b still ends TMIN before its shot ends)
  2. start a earlier (if a keeps its own pause before it)
  3. speed b up, then a, as little as needed (<= MAXF)
Writes plan_v12_pauses.json {sid: {edit, lead, f}} for build_cut_v12.py.
Usage (repo root): python docs/atuona/film9_stanza_work/plan_v12_pauses.py <render_v10 dir>"""
import json, subprocess, sys
FB = 'C:/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32/ffprobe.exe'
R = sys.argv[1]
G, LMIN, TMIN, MAXF, XF = 1.0, 0.35, 0.35, 1.15, 1.3
M4_DUR = 6.0   # the whole 5.04 s clip at x1.2: the sand pours as a process, not a still
tl = json.load(open(f'{R}/work/timeline.json', encoding='utf-8'))
dur = lambda f: float(subprocess.run([FB, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
order = [t['shot'] for t in tl]
V = {s: dur(f'{R}/vo/{s}.mp3') for s in order}
start = {t['shot']: t['start'] for t in tl}
d = {t['shot']: t['dur'] for t in tl}
shift = (M4_DUR - 2 * XF) - (0.9 - 0.2)      # M3 -> [M4 shot] -> M5 instead of M3 -> [0.9 s flash, 0.1 s cuts] -> M5
for s in order[order.index('M5'):]:
    start[s] += shift
lead = {s: 0.5 for s in order}; f = {s: 1.0 for s in order}
L = lambda s: V[s] / f[s]
end = lambda s: start[s] + lead[s] + L(s)
def gap(a, b): return start[b] + lead[b] - end(a)
prev = {b: a for a, b in zip(order, order[1:])}
for a, b in zip(order, order[1:]):
    deficit = G - gap(a, b)
    if deficit <= 0:
        continue
    room_b = d[b] - TMIN - L(b) - lead[b]                         # 1. b later
    step = min(deficit, max(0.0, room_b)); lead[b] += step; deficit -= step
    if deficit > 1e-6:                                            # 2. a earlier, keeping a's own pause
        slack_a = (gap(prev[a], a) - G) if a in prev else (lead[a] - LMIN)
        step = min(deficit, max(0.0, lead[a] - LMIN), max(0.0, slack_a)); lead[a] -= step; deficit -= step
    if deficit > 1e-6:                                            # 3. speed b, then a
        for s in (b, a):
            if deficit <= 1e-6: break
            want = L(s) - deficit; fs = min(MAXF, V[s] / max(want, 0.1)); saved = L(s) - V[s] / fs
            f[s] = fs; deficit -= saved
            if s == b: lead[b] += saved          # a shorter b only helps if b also starts later, into the time it freed
    if deficit > 1e-6:
        print(f'  {a}->{b}: still {deficit:.2f}s short of a {G}s pause')
out = {}
for i, s in enumerate(order):
    g = gap(s, order[i + 1]) if i + 1 < len(order) else None
    assert lead[s] >= LMIN - 1e-6 and lead[s] + L(s) <= d[s] - TMIN + 1e-6, s
    out[s] = {'edit': d[s], 'lead': round(lead[s], 2), 'f': round(f[s], 3), 'line': round(L(s), 2), 'pause_after': None if g is None else round(g, 2)}
    print(f"{s:4} shot {d[s]:5.2f}s  line at {lead[s]:4.2f}s  speed x{f[s]:.2f}  pause after {('%.2f' % g) if g is not None else '-':>5}s")
json.dump({'M4_DUR': M4_DUR, 'G': G, 'shots': out}, open('docs/atuona/film9_stanza_work/plan_v12_pauses.json', 'w'), indent=1)
ps = [v['pause_after'] for v in out.values() if v['pause_after'] is not None]
print(f'pauses now: min {min(ps):.2f}s; lines sped up: {sum(1 for v in out.values() if v["f"] > 1.001)} (max x{max(v["f"] for v in out.values()):.2f})')
