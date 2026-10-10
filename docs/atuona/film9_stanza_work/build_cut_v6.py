"""10 Oct 2026: the v6 cut of Atuona film #9 = the v5 cut (music C, flowing glitch, her edits) with NEW TEXT:
Elena: "put on each shot appropriate stanza from my true content. Now stanzas are torn and inappropriate and put in the end
of the movie number of each poem in a clickable format."
  - each moving shot carries ONE WHOLE stanza of her ATUONA vault (#047-#099), her published English, split on her own blank
    lines (v6_stanza_inventory.json, from atuona metadata 'English Text'); picks in v6_picks.json {sid: stanza id}
  - every stanza is spoken by the films' narrator (OpenAI tts-1 onyx 0.9); the four Mila shots carry Mila stanzas
  - the last card lists every quoted poem as its atuona.xyz deep link (atuona.xyz/#pNNN opens that poem), titles as the site shows
Refuses to write the cut unless every stanza is verbatim in her text, fits its shot's reading budget, is not burned in film 7/8,
and no poem is used twice. Run from the repo root: python docs/atuona/film9_stanza_work/build_cut_v6.py <atuona repo>"""
import json, re, sys
ATU = sys.argv[1]
W = 'docs/atuona/film9_stanza_work'
norm = lambda s: re.sub(r'\s+', ' ', s.replace(' ', ' ')).strip()
cut = json.load(open(f'{W}/cut_v5_2026-10-10.json', encoding='utf-8'))
inv = {s['id']: s for s in json.load(open(f'{W}/v6_stanza_inventory.json', encoding='utf-8'))}
picks = json.load(open(f'{W}/v6_picks.json', encoding='utf-8'))
# every stanza is also SPOKEN (onyx, ~2.3 words/s): words <= 2.4 x (shot + 0.5 s), so a shot grows ~2 s at most for its line
budget = {i['sid']: round(2.4 * (i['edit'] + 0.5)) for i in cut['items'] if 'clip' in i}
MILA = {'M1', 'M2', 'M3', 'M5'}   # Elena: when Mila appears with Jean-Marc, the stanza is about Mila (frames checked: all four show them)
site = {p['id']: p['title'] for p in json.load(open('docs/atuona/poems_src/poems_github_2026-10-08.json', encoding='utf-8'))}
errs, used, links = [], {}, []
for it in cut['items']:
    if 'clip' not in it:
        continue
    sid = it['sid']; pid = picks.get(sid)
    if not pid or pid not in inv:
        errs.append(f'{sid}: no valid pick ({pid})'); continue
    st = inv[pid]; n = st['poem']
    meta = json.load(open(f'{ATU}/metadata/{n}.json', encoding='utf-8'))
    en = {a.get('trait_type'): a.get('value') for a in meta['attributes']}.get('English Text', '')
    if norm(st['text']) not in norm(en): errs.append(f'{sid}: {pid} is not verbatim in #{n}')
    if st['words'] > budget[sid]: errs.append(f'{sid}: {pid} has {st["words"]} words > budget {budget[sid]}')
    if st['used_in_film_7_8']: errs.append(f'{sid}: {pid} was burned in film 7/8')
    if sid in MILA and not (re.search(r'Mila', st['text']) or 82 <= int(n) <= 86): errs.append(f'{sid}: {pid} is not about Mila')
    if n in used and not (sid in MILA and used[n] in MILA): errs.append(f'{sid}: poem #{n} already on {used[n]}')
    first = n not in used
    used.setdefault(n, sid)
    it.update({'stanza': st['text'], 'poem': '#' + n, 'lang': 'en', 'stanza_id': pid, 'voice': 'onyx'})
    if first: links.append({'num': n, 'title': site.get(n, st['title'])})
if errs:
    print('REFUSED:'); [print('  ' + e) for e in errs]; sys.exit(1)
cut['poem_links'] = links; cut['poem_card_dur'] = 7.0
cut['poems_atuona'] = ' '.join('#' + l['num'] for l in sorted(links, key=lambda l: l['num'])); cut['poems_litprom'] = ''
cut['moments'] = f'10.10.2026  ·  atuona.xyz Gallery  ·  Fragments\n{len(links)} poems  ·  ATUONA'
cut['_note'] = "v6, 10 Oct 2026: v5 + one whole stanza of her ATUONA poems per shot (v6_picks.json) + poem-link end card; see build_cut_v6.py"
out = f'{W}/cut_v6_2026-10-10.json'
json.dump(cut, open(out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(f'OK {sum(1 for i in cut["items"] if "clip" in i)} shots, {len(links)} poems, all verbatim, all within budget -> {out}')
