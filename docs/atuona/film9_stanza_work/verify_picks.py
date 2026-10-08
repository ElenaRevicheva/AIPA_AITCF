"""8 Oct 2026: code check of the editor's stanza picks against Elena's corpus (content/poems.json from the atuona repo).
A pick survives only if its source_quote is her text exactly (whitespace-normalised) inside the cited poem. Also checks:
one stanza per slot, no stanza twice, no poem more than twice, nothing reused from films #7/#8.
in: picks.json (workflow output)   out: picks_verified.json + a report"""
import json, re, sys

W = 'docs/atuona/film9_stanza_work'
P = {p['id']: p for p in json.load(open('docs/atuona/poems_src/poems_github_2026-10-08.json', encoding='utf-8'))}
picks = json.load(open(f'{W}/picks.json', encoding='utf-8'))
slots = {s['slot']: s for s in json.load(open(f'{W}/slots.json', encoding='utf-8'))['slots']}
norm = lambda s: re.sub(r'\s+', ' ', s.replace(' ', ' ').replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')).strip()
avoid = norm(open(f'{W}/avoid_used_in_films_7_8.txt', encoding='utf-8').read()).lower()

def lines(pid):
    return [l.strip() for l in P[pid]['verse'].split('\n') if l.strip()]

def check(pk):
    pid = pk['poem'].lstrip('#').zfill(3)
    if pid not in P:
        return None, f'no poem {pid}'
    L = lines(pid)
    q = norm(pk['source_quote'].replace(' / ', ' '))
    span = norm(' '.join(L[max(0, pk['l_from'] - 1): pk['l_to']]))
    whole = norm(' '.join(L))
    if q and q in span:
        where = 'in cited lines'
    elif q and q in whole:
        where = 'in poem, other lines'
    else:
        return None, 'NOT her exact text'
    # exact text with her line breaks, rebuilt from the corpus
    out, buf = [], ''
    for l in L[max(0, pk['l_from'] - 1): pk['l_to']] if where == 'in cited lines' else L:
        if norm(l) and norm(l) in q:
            out.append(l)
    text = ' / '.join(out) if out and norm(' '.join(out)) == q else pk['source_quote']
    return {'poem': pid, 'title': P[pid]['title'], 'lang': P[pid]['lang'], 'venue': P[pid].get('venue', ''),
            'source_text': text, 'where': where}, None

rep, ok, used, per_poem = [], {}, set(), {}
for pk in picks:
    res, err = check(pk)
    s = pk['slot']
    if err:
        rep.append(f'{s:>4} FAIL {err}: #{pk["poem"]} L{pk["l_from"]}-{pk["l_to"]} {pk["source_quote"][:80]}')
        continue
    key = norm(res['source_text']).lower()
    if key in used:
        rep.append(f'{s:>4} FAIL duplicate stanza'); continue
    if len(key) > 25 and key[:60] in avoid:
        rep.append(f'{s:>4} FAIL reused from film 7/8'); continue
    used.add(key); per_poem[res['poem']] = per_poem.get(res['poem'], 0) + 1
    ok[s] = {**res, 'slot': s, 'why': pk.get('why', ''), 'est_en_words': pk.get('est_en_words'),
             'max_words': slots[s]['max_words'], 'target_words': slots[s]['target_words'],
             'frame_image': slots[s]['frame_image'], 'what_we_see': slots[s]['what_we_see']}
    if res['where'] != 'in cited lines':
        rep.append(f'{s:>4} note: quote found in #{res["poem"]} but not at the cited lines')
over = {k: v for k, v in per_poem.items() if v > 2}
missing = [s for s in slots if s not in ok]
rep.append(f'verified {len(ok)}/{len(slots)}; missing {missing}; poems used {len(per_poem)}; over 2 per poem {over}')
json.dump([ok[s] for s in slots if s in ok], open(f'{W}/picks_verified.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print('\n'.join(rep))
