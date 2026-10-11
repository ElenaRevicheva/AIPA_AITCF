"""11 Oct 2026: prove every stanza of a film #9 cut is the true text of the fragment its number names - against the LIVE
atuona.xyz vault, not our own records. Elena: "poem number should be actual fitting the true poem content on each stanza".
Each stanza must be found inside the live page's fragment #pNNN (and the script prints every fragment it occurs in).
Usage (repo root): python docs/atuona/film9_stanza_work/vault_check.py <cut.json>"""
import re, json, html, sys, urllib.request, random
page = urllib.request.urlopen(f'https://atuona.xyz/?v={random.randint(1, 10**9)}', timeout=60).read().decode('utf-8')
marks = [(m.start(), m.group(1)) for m in re.finditer(r'id="p(\d{3})"', page)]
body = {n: re.sub(r'<[^>]+>', ' ', re.sub(r'<br\s*/?>', ' ', page[pos:(marks[k + 1][0] if k + 1 < len(marks) else len(page))])) for k, (pos, n) in enumerate(marks)}
key = lambda x: re.sub(r'[^a-z0-9]+', ' ', html.unescape(x).lower().replace('’', "'").replace('‘', "'")).strip()
cut = json.load(open(sys.argv[1], encoding='utf-8'))
bad = 0
for it in cut['items']:
    if 'clip' not in it or not it.get('stanza'): continue
    n = it['poem'][1:]; st = key(it['stanza'])
    where = [m for m, b in body.items() if st in key(b)]
    ok = n in where; bad += not ok
    print(f"{'OK ' if ok else 'BAD'} {it['sid']:4} #{n}  in live fragment(s): {where}")
print(f'{len(marks)} fragments on the live page; ' + ('ALL MATCH THE LIVE VAULT' if not bad else f'{bad} MISMATCH(ES)'))
sys.exit(1 if bad else 0)
