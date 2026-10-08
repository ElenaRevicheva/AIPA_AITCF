"""8 Oct 2026: build ~/atuona-film9/cut.json for scripts/atuona-film9.mjs from
  - stanzas_final.json : one stanza per slot (her English verbatim, or our atmospheric English of her Russian), source-checked
  - clip_choice.json   : which clip each slot uses (+ optional ss / src cap from QC)
  - film9_motion_directions_2026-10-08.json : edit seconds and slow factor per shot
Approved frames only; nothing is deleted. Run locally, then scp cut.json to Oracle."""
import json, sys

W = 'docs/atuona/film9_stanza_work'
ST = {s['slot']: s for s in json.load(open(f'{W}/stanzas_final.json', encoding='utf-8'))['stanzas']}
CL = json.load(open(f'{W}/clip_choice.json', encoding='utf-8'))
MD = {s['shot']: s for s in json.load(open('docs/atuona/film9_motion_directions_2026-10-08.json', encoding='utf-8'))['shots']}
ORDER = ['1a', '1b', '1c', '2', '5', '6', '7m', '7', '9', '10a', '10b', '11', 'M1', 'M2', '13', '14', 'M3', 'M4', 'M5', '15',
         '16b', '17', '18', '19', '20', '20b', '21', '22', '24', '25', '26', '27', '28', '30', '31', '32', '34', '35', '36', '37']
GLITCH_AFTER = {'7': 'G7.jpg', '11': 'G8_clean.jpg', '14': 'G6s.jpg'}   # Elena's 3 approved flashes, each after the image it echoes
items = []
for sid in ORDER:
    if sid == '1c':   # her own line, kept as the film's one text card (#053)
        items.append({'sid': '1c', 'card': "I'm a lesbian. / Please consider this for possible group activities.", 'card_dur': 4.5,
                      'poem': '#053'})
        continue
    st = ST[sid]
    it = {'sid': sid, 'stanza': st['en'], 'poem': '#' + st['poem'], 'lang': st['lang'], 'voice': 'kira'}
    if sid == '35':
        c = CL['35']
        it.update({'clip': c['clip'], 'edit': 5.0, 'slow': 1.0, 'composite_of': '36', 'composite_offset': 3.0, 'composite_opacity': 0.55})
    else:
        c, md = CL[sid], MD[sid]
        it.update({'clip': c['clip'], 'edit': c.get('edit', md['edit_seconds']), 'slow': c.get('slow', md['slow_factor'])})
        for k in ('ss', 'trim', 'end', 'tail', 'tail_ss', 'tail_min'):
            if c.get(k):
                it[k] = c[k]
        if c.get('trim'):   # a trimmed clip: let the voice set the length instead of the old planned edit
            it['edit'] = min(it['edit'], round(c['trim'] * it['slow'], 1))
    it['qc'] = c.get('qc', '')
    if sid == '5':
        it['reverse'] = True   # generated falling, played rising (scenario production note)
    if sid == '17':
        it['key'] = {'img': 'k17b.jpg', 'plate_h': 0.424, 'x': 0.442, 'y': 0.452, 'hflip': True, 'similarity': 0.16, 'blend': 0.06}
    if sid in GLITCH_AFTER:
        it['glitch_after'] = GLITCH_AFTER[sid]
    items.append(it)
nums = sorted({int(i['poem'][1:]) for i in items})
atu = ' '.join(f'#{n:03d}' for n in nums if n >= 47)
lit = ' '.join(f'#{n:03d}' for n in nums if n <= 46)
cut = {'title': 'ATUONA', 'cover': '1a', 'music': 'music/film9_deephouse.mp3',   # Elena 8 Oct: deep house underground; ~30 poems do not fit a card line: the count goes on it
       'moments': f'08.10.2026  ·  atuona.xyz Gallery  ·  Fragments\n{len(nums)} poems  ·  ATUONA + LITPROM',
       'poems_atuona': atu, 'poems_litprom': lit, 'items': items}
missing = [s for s in ORDER if s != '1c' and not next(i for i in items if i['sid'] == s).get('stanza')]
assert not missing or __import__('os').environ.get('PARTIAL') == '1', missing   # PARTIAL=1: voice the finished stanzas early
json.dump(cut, open(f'{W}/cut.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(len(items), 'items;', len(nums), 'poems;', cut['moments'].replace('\n', ' | '))
