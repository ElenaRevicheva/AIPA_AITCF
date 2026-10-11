r"""11 Oct 2026: the v11 cut of Atuona film #9 = v10 (PowerShell typing, fragments wording) + ONE FINAL SHOT with Arearea.
Elena: "search for Arearea history of painting. we need to make one final shot with it - impressionistic, underground aesthetic,
full of true Gauguin sense, fitting my gallery content."
  shot A (after 37, the last before the outro): clip vA1 (Venice Kling O3 Pro from keyframe kA1: the opening shot's empty
  auction-house wall now carries Arearea, its colours spill as light on the floor and on Kira and Ule standing apart; then the
  image drains from the canvas and only its light stays) - answers 1a ("What about the painting?" she asked. "Paradise?").
  text: her fragment #087 "Red Dog" (about Arearea), which has no stanza breaks: the terminal runs Get-Content
  .\fragments\087.txt and prints the WHOLE first stanza (lines 0-56, to "Typing..."), scrolling; lines 40-46 type with the
  narrator: "Today Arearea lives in / Musee d'Orsay. / But ATUONA knows - / the painting isn't there. / It remains in the gap /
  between what is / and what the artist decided to see."
Run from the repo root: python docs/atuona/film9_stanza_work/build_cut_v11.py <atuona repo> <voice seconds of A>"""
import json, sys
W = 'docs/atuona/film9_stanza_work'
ATU, VD = sys.argv[1], float(sys.argv[2])
cut = json.load(open(f'{W}/cut_v10_2026-10-11.json', encoding='utf-8'))
m = json.load(open(f'{ATU}/metadata/087.json', encoding='utf-8'))
L = [l.strip() for l in {a['trait_type']: a['value'] for a in m['attributes']}['English Text'].replace('\r', '').split('\n') if l.strip()]
assert L[40] == 'Today Arearea lives in' and L[56] == 'Typing\u2026', (L[40], L[56])
inv = {s['id']: s for s in json.load(open(f'{W}/v6_stanza_inventory.json', encoding='utf-8'))}
assert inv['S087.1']['text'].split('\n') == L[:57], 'stream != her stanza S087.1'
lead = 0.5 + 0.06 * 40 + 0.45            # the command, then 40 lines printing fast, then the voiced lines
after = 0.22 * (57 - 47)                  # lines 47..56 print slower
item = {'sid': 'A', 'clip': 'vA1__venice-kling-o3-pro.mp4', 'poem': '#087', 'lang': 'en', 'voice': 'onyx',
        'stanza': '\n'.join(L[40:47]), 'stanza_id': 'S087.1', 'term_stream': {'lines': L[:57], 'voiced': [40, 46]},
        'lead': round(lead, 2), 'tail_extra': round(after, 2), 'slow': 1.2, 'glitchy': 'flow',
        'edit': round(lead + VD + 1.2 + after, 2), 'planned_edit': round(lead + VD + 1.2 + after, 2),
        'qc': 'Elena 11 Oct: the Arearea final shot (keyframe kA1, fragment #087 Red Dog)'}
items = cut['items']; i37 = [k for k, x in enumerate(items) if x.get('sid') == '37'][0]
items.insert(i37 + 1, item)
links = cut['poem_links']
if not any(l['num'] == '087' for l in links):
    site = {p['id']: p['title'] for p in json.load(open('docs/atuona/poems_src/poems_github_2026-10-08.json', encoding='utf-8'))}
    links.append({'num': '087', 'title': site.get('087', 'Red Dog')})
n = len({x['poem'] for x in items if 'clip' in x})
cut['moments'] = cut['moments'].split('\n')[0] + f'\n{n} fragments  \u00b7  ATUONA'
cut['text_design']['window'] = 7   # the streamed fragment shows 7 lines at a time (less over Kira)
cut['_note'] = "v11, 11 Oct 2026: v10 + the Arearea final shot (fragment #087 streamed whole); see build_cut_v11.py"
json.dump(cut, open(f'{W}/cut_v11_2026-10-11.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(f"cut_v11: shot A after 37, edit {item['edit']} s, lead {item['lead']} s; {n} fragments; end card {len(links)} links")
