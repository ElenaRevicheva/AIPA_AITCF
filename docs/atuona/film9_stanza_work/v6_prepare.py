"""10 Oct 2026, v6 stanza re-pick (Elena: "put on each shot appropriate stanza from my true content. Now stanzas are torn and
inappropriate"). Builds the two inputs the curators read:
  v6_stanza_inventory.txt/.json : every WHOLE stanza of the ATUONA vault #047-#099, her published English (metadata
                                  'English Text', split on her own blank lines), verbatim, with word counts
  v6_shots.json                 : each moving shot of the v5 cut in order: seconds, word budget, what is on screen, frame image
LITPROM #001-#046 is left out: no source keeps its stanza breaks and it is Russian (a translation is not her verbatim text).
Run from the repo root: python docs/atuona/film9_stanza_work/v6_prepare.py <atuona repo> <plan_shots.json> <frames dir>"""
import json, re, sys, subprocess, os
ATU, PLAN, FR = sys.argv[1], sys.argv[2], sys.argv[3]
W = 'docs/atuona/film9_stanza_work'
FB = 'C:/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32'
CLIPS = 'C:/Users/kirav/Pictures/Atuona-film9-private/APPROVED_2026-10-08/clips'
avoid = open(f'{W}/avoid_used_in_films_7_8.txt', encoding='utf-8').read()
norm = lambda s: re.sub(r'\s+', ' ', s).strip()
key = lambda s: re.sub(r'[^a-z0-9 ]', '', re.sub(r'\s+', ' ', s.lower())).strip()
inv, out = [], []
for n in range(47, 100):
    m = json.load(open(f'{ATU}/metadata/{n:03d}.json', encoding='utf-8'))
    tr = {a.get('trait_type'): a.get('value') for a in m.get('attributes', [])}
    en = (tr.get('English Text') or '').replace('\r', '')
    title = tr.get('Poem') or m.get('name', '')
    if not en.strip():
        continue
    blocks = [b.strip('\n') for b in re.split(r'\n\s*\n', en) if b.strip()]
    for k, b in enumerate(blocks, 1):
        lines = [l.rstrip() for l in b.split('\n') if l.strip()]
        text = '\n'.join(l.strip() for l in lines)
        words = len(norm(text).split())
        if len(lines) == 1 and words <= 4 and k == 1:
            continue                                   # the title line at the top of a poem
        burned = any(key(l)[:36] in key(avoid) for l in lines if len(key(l)) > 20)   # quotes/dashes/case ignored: '"I found paradise' = 'I found paradise'
        sid = f'S{n:03d}.{k}'
        inv.append({'id': sid, 'poem': f'{n:03d}', 'title': title, 'lines': len(lines), 'words': words, 'used_in_film_7_8': burned, 'text': text})
        out.append(f'=== {sid} | #{n:03d} {title} | {len(lines)} lines, {words} words{" | USED IN FILM 7/8 - avoid" if burned else ""}\n{text}\n')
json.dump(inv, open(f'{W}/v6_stanza_inventory.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
open(f'{W}/v6_stanza_inventory.txt', 'w', encoding='utf-8').write('\n'.join(out))
print(len(inv), 'stanzas from', len({i['poem'] for i in inv}), 'poems')

plan = json.load(open(PLAN, encoding='utf-8'))
cut = json.load(open(f'{W}/cut_v5_2026-10-10.json', encoding='utf-8'))
shots = []
for k, it in enumerate([i for i in cut['items'] if 'clip' in i], 1):
    clip = it['clip']; key = os.path.basename(clip).split('__')[0].replace('.mp4', '')
    pk = key if key in plan else ('v' + it['sid'] if 'v' + it['sid'] in plan else None)
    motion = plan[pk]['motion'] if pk else ''
    if key.startswith('sm_'):
        motion = '(still image with slow camera motion) ' + (plan.get('v' + it['sid'], {}).get('motion', ''))
    src = os.path.normpath(os.path.join(CLIPS, clip)).replace(os.sep, '/')
    d = float(subprocess.run([f'{FB}/ffprobe.exe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src], capture_output=True, text=True).stdout)
    end = min(d, it.get('trim') or d)
    img = f'{FR}/{k:02d}_{it["sid"]}.jpg'
    subprocess.run([f'{FB}/ffmpeg.exe', '-v', 'error', '-y', '-ss', f'{end*0.25:.2f}', '-i', src, '-ss', f'{end*0.75:.2f}', '-i', src,
                    '-filter_complex', '[0:v]scale=800:-2[a];[1:v]scale=800:-2[b];[a][b]hstack', '-frames:v', '1', img], check=True)
    secs = it['edit']
    shots.append({'order': k, 'sid': it['sid'], 'seconds': secs, 'word_budget': int(4.2 * secs), 'frame_image': img,
                  'on_screen': motion, 'rejected_stanza_now': it.get('stanza', ''), 'rejected_from_poem': it.get('poem', '')})
json.dump(shots, open(f'{W}/v6_shots.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(len(shots), 'shots;', 'frames in', FR)
