"""12 Oct 2026: the v17 cut of film #9 AREAREA = the published v16 + Elena:
  "I do not like just 2 stanzas - in a row they say morning and next one says morning. Dig in my true content, and change one of
   these two stanzas so that one stanza is completely different without a word morning and fits the movie sense. Also change
   Atuona in the end to the name of the movie Arearea - and nearby paste a little note from the history of art you explored about
   real Arearea painting, some true genuine rare facts you digged for."
  - 10a (after 9 "Morning in Atuona...") : #071 "This morning I was looking at notes about Monet..." -> S093.24 "Paradise is not
    painted. / Paradise is compiled. / One brushstroke at a time." (#093, her words: the film is a compiled paradise). New onyx take
    (tts-1, 0.9) in render_v17/vo_new/10a.mp3, 5.0 s against the old 5.3 s, so 10a keeps its lead and every pause only grows.
  - the closing card: AREAREA instead of ATUONA, with four verified facts (docs/atuona/AREAREA_RESEARCH_2026-10-11.md)
  - every shot keeps its v16 length; every other line keeps its v16 start and speed
Run from the repo root: python docs/atuona/film9_stanza_work/build_cut_v17.py <render_v17 dir>"""
import json, subprocess, sys
FB = 'C:/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32/ffprobe.exe'
R17 = sys.argv[1]
W = 'docs/atuona/film9_stanza_work'
cut = json.load(open(f'{W}/cut_v16_2026-10-11.json', encoding='utf-8'))
p16 = json.load(open(f'{W}/plan_v16.json'))
inv = {s['id']: s for s in json.load(open(f'{W}/v6_stanza_inventory.json', encoding='utf-8'))}
site = {p['id']: p['title'] for p in json.load(open('docs/atuona/poems_src/poems_github_2026-10-08.json', encoding='utf-8'))}
dur = lambda f: float(subprocess.run([FB, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
st = inv['S093.24']
assert 'morning' not in st['text'].lower()
L = dur(f'{R17}/vo_new/10a.mp3')
for it in cut['items']:
    if it.get('sid') == '10a':
        assert it['lead'] + L <= it['edit'] - 0.35, (it['lead'], L, it['edit'])
        it.update({'stanza': st['text'], 'poem': '#' + st['poem'], 'stanza_id': st['id']})
        it.pop('voice_speed', None)
plan = dict(p16); plan['10a'] = dict(p16['10a'], line=round(L, 2), f=1.0, new_take=True)
for s in plan:
    if s != '10a': plan[s] = dict(plan[s], new_take=False)
seen, links = set(), []
for it in cut['items']:
    n = it.get('poem', '')[1:]
    if n and n not in seen:
        seen.add(n); links.append({'num': n, 'title': site.get(n, inv.get(it.get('stanza_id', ''), {}).get('title', ''))})
cut['poem_links'] = links
cut['poems_atuona'] = ' '.join('#' + l['num'] for l in sorted(links, key=lambda l: l['num']))
cut['moments'] = cut['moments'].split('\n')[0] + f'\n{len(links)} fragments  \u00b7  ATUONA'
cut['outro'] = {'title': 'AREAREA', 'dur': 11, 'sign': 'atuona.xyz // Paradise.js \u00b7 by Kira Velerevich', 'note': [
    "Paul Gauguin, Arearea, 1892 \u2014 painted in Tahiti. Mus\u00e9e d'Orsay.",
    "Paris called it Le Chien rouge: at Durand-Ruel in 1893 the red dog drew sarcasm.",
    "In 1895 Gauguin bought it back himself at a Drouot sale, before leaving Europe for good.",
    "The idol is invented \u2014 a small Maori figure he enlarged to the size of a Buddha."]}
cut['_note'] = "v17, 12 Oct 2026: v16 + 10a new stanza S093.24 (#093, no 'morning' after 9), AREAREA closing card with art-history note; see build_cut_v17.py"
json.dump(cut, open(f'{W}/cut_v17_2026-10-12.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
json.dump(plan, open(f'{W}/plan_v17.json', 'w'), indent=1)
open(f'{W}/v17_reseg.txt', 'w').write('10a')
print(f'{len(links)} fragments on the end card; 10a: {plan["10a"]}')
