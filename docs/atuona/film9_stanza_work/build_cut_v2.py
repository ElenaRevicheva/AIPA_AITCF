"""10 Oct 2026: the v2 cut of Atuona film #9 — Elena's own edit of the 8 Oct preview (5:24), given as 27 screenshots she named
with the action, plus three clips named "add this shot", in
  D:/ATUONA_FILM9_ALL_MATERIAL_2026-10-08/02_APPROVED/09.10.2026 shots to be removed from the film/
Every screenshot was tied to its shot by its playhead time + the stanza on screen (two independent agents per screenshot,
all 27 agreed; map in the handover doc). Her instructions, by shot id:
  REMOVED      5 1c(card) 7 17 18 21 24 26 27 28 30 32 34
  MUCH SHORTER 1a 1b 7m 22            -> MUCH s
  SHORTER      10a 10b 11 25          -> min(SHORT s, 0.8 x planned)
  MAKE A GLITCH   35                  -> a 1.2 s Crimson flash of its still instead of the moving shot (no stanza: a flash cannot carry text)
  MAKE A SHORT GLITCH  M4 19 20 20b   -> a 0.9 s flash
  36: "when the image stops moving remove" -> the 4 s walk only, no still-motion tail
  ADD THIS SHOT  v30b (shot 30: her removal is the still-motion sm_k30, the Kling take goes in with 30's stanza)
                 v24Lb (shot 24: her removal is the tears clip v24La, the auction-lots clip goes in with 24's stanza)
                 vM3   (shot M3: already in the film, unchanged)
  MAKE A GLITCH FROM THE IMAGE  k37.v1 G7s G8s k11(qa1_1006) -> four new 1.2 s flashes, each beside the image it echoes
Voice is OFF (FILM9_NO_VO=1): Elena put it on hold on 8 Oct, and a shot cannot be "much shorter" while it is stretched to its
voice line. Music: the compile keeps the deep-house bed; a no-music variant is mixed from the same body.
Run from the repo root on the laptop: python docs/atuona/film9_stanza_work/build_cut_v2.py -> cut_v2_2026-10-10.json
"""
import json

W = 'docs/atuona/film9_stanza_work'
ST = {s['slot']: s for s in json.load(open(f'{W}/stanzas_final.json', encoding='utf-8'))['stanzas']}
CL = json.load(open(f'{W}/clip_choice.json', encoding='utf-8'))
MD = {s['shot']: s for s in json.load(open('docs/atuona/film9_motion_directions_2026-10-08.json', encoding='utf-8'))['shots']}

MUCH, SHORT, MIN_SHOT = 3.8, 5.0, 3.0
GLITCH, SHORT_GLITCH = 1.2, 0.9

# the sequence: ('shot', sid, {overrides}) | ('glitch', label, image, seconds) ; the three approved 7 Oct flashes keep their places
SEQ = [
    ('shot', '1a', {'edit': MUCH}),                       # much shorter
    ('shot', '1b', {'edit': MUCH}),                       # much shorter
    # 1c card removed
    ('shot', '2', {}),
    # 5 removed
    ('shot', '6', {}),
    ('glitch', 'G7s', 'G7s.jpg', GLITCH),                 # new: Kira and Ule in the night sea (the image G7 came from)
    ('shot', '7m', {'edit': MUCH}),                       # much shorter
    ('glitch', 'G7', 'G7.jpg', GLITCH),                   # approved 7 Oct, was after shot 7 (removed): the flash stays
    ('shot', '9', {}),
    ('shot', '10a', {'edit': 'short'}),                   # shorter
    ('shot', '10b', {'edit': 'short'}),                   # shorter
    ('glitch', 'k11q', 'k11_qa1_1006.jpg', GLITCH),       # new: the blue-haired Kira at the mirror, before the mirror shot
    ('shot', '11', {'edit': 'short', 'glitch_after': 'G8_clean.jpg'}),   # shorter; approved flash kept
    ('shot', 'M1', {}),
    ('shot', 'M2', {}),
    ('shot', '13', {}),
    ('shot', '14', {'glitch_after': 'G6s.jpg'}),          # approved flash kept
    ('shot', 'M3', {}),                                   # "add this shot" vM3 = already this shot
    ('glitch', 'M4', 'M4.jpg', SHORT_GLITCH),             # make a short glitch
    ('shot', 'M5', {}),
    ('shot', '15', {}),
    ('shot', '16b', {}),
    # 17, 18 removed
    ('glitch', '19', 'k19.jpg', SHORT_GLITCH),            # make a short glitch
    ('glitch', '20', 'k20.jpg', SHORT_GLITCH),            # make a short glitch
    ('glitch', '20b', 'k20b.jpg', SHORT_GLITCH),          # make a short glitch
    # 21 removed
    ('shot', '22', {'edit': MUCH}),                       # much shorter
    ('shot', '24b', {'clip': 'v24Lb__venice-kling-o3-pro.mp4', 'edit': 10.0, 'slow': 1.0, 'stanza_of': '24',
                     'qc': 'Elena 9 Oct "add this shot": the auction lots on black velvet, whole clip; the tears clip v24La is removed'}),
    ('shot', '25', {'edit': 'short'}),                    # shorter
    # 26, 27, 28 removed
    ('shot', '30b', {'clip': 'v30b__venice-kling-o3-pro.mp4', 'edit': 5.5, 'slow': 1.2, 'stanza_of': '30',
                     'qc': 'Elena 9 Oct "add this shot": the Kling take of k30 (her head locked, his throat lit); the still-motion sm_k30 is removed'}),
    ('shot', '31', {}),
    # 32 removed
    ('glitch', 'G8s', 'G8s.jpg', GLITCH),                 # new: Kira with Ule behind her at the red-lamp mirror
    # 34 removed
    ('glitch', '35', 'k36_double.jpg', GLITCH),           # make a glitch: the double exposure of k36 that shot 35 was
    ('shot', '36', {'no_tail': True}),                    # when the image stops moving, remove: the walk only
    ('glitch', 'k37v1', 'k37.v1.jpg', GLITCH),            # new: Kira in the foam at lilac dusk, before the last shot
    ('shot', '37', {}),
]

items = []
for kind, sid, *rest in SEQ:
    if kind == 'glitch':
        img, secs = rest
        items.append({'sid': f'g_{sid}', 'glitch_only': img, 'glitch_dur': secs})
        continue
    ov = rest[0]
    base = ov.get('stanza_of', sid)
    st = ST[base]
    it = {'sid': sid, 'stanza': st['en'], 'poem': '#' + st['poem'], 'lang': st['lang'], 'voice': 'kira'}
    c = dict(CL.get(sid) or CL[base]); md = MD.get(sid) or MD[base]
    if 'clip' in ov:
        c = {'clip': ov['clip'], 'qc': ov['qc']}
    it.update({'clip': c['clip'], 'edit': c.get('edit', md['edit_seconds']), 'slow': ov.get('slow', c.get('slow', md['slow_factor']))})
    for k in ('ss', 'trim', 'end', 'tail', 'tail_ss', 'tail_min'):
        if c.get(k):
            it[k] = c[k]
    if ov.get('no_tail'):
        for k in ('tail', 'tail_ss', 'tail_min'):
            it.pop(k, None)
    if c.get('trim'):
        it['edit'] = min(it['edit'], round(c['trim'] * it['slow'], 1))
    planned = it['edit']
    if ov.get('edit') == 'short':
        it['edit'] = round(max(MIN_SHOT, min(SHORT, planned * 0.8)), 1)
    elif isinstance(ov.get('edit'), (int, float)):
        it['edit'] = min(ov['edit'], planned) if 'clip' not in ov else ov['edit']
    it['planned_edit'] = planned
    it['qc'] = c.get('qc', '')
    if sid == '5':
        it['reverse'] = True
    if sid == '17':
        it['key'] = {'img': 'k17b.jpg', 'plate_h': 0.424, 'x': 0.442, 'y': 0.452, 'hflip': True, 'similarity': 0.16, 'blend': 0.06}
    if ov.get('glitch_after'):
        it['glitch_after'] = ov['glitch_after']
    items.append(it)

nums = sorted({int(i['poem'][1:]) for i in items if i.get('poem')})
atu = ' '.join(f'#{n:03d}' for n in nums if n >= 47)
lit = ' '.join(f'#{n:03d}' for n in nums if n <= 46)
cut = {'title': 'ATUONA', 'cover': '1a', 'music': 'music/film9_deephouse.mp3',
       'moments': f'10.10.2026  ·  atuona.xyz Gallery  ·  Fragments\n{len(nums)} poems  ·  ATUONA + LITPROM',
       'poems_atuona': atu, 'poems_litprom': lit, 'items': items,
       '_note': 'v2, 10 Oct 2026: Elena\'s screenshot edit of the 8 Oct preview; no voice; see build_cut_v2.py'}
out = f'{W}/cut_v2_2026-10-10.json'
json.dump(cut, open(out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
shots = [i for i in items if 'clip' in i]
flashes = [i for i in items if 'glitch_only' in i]
print(len(items), 'items =', len(shots), 'shots +', len(flashes), 'flashes;', len(nums), 'poems;', cut['moments'].replace('\n', ' | '))
print('shot seconds (planned -> v2):')
for i in shots:
    print(f"  {i['sid']:4} {i['planned_edit']:5} -> {i['edit']:5}  {i['clip']}")
total = sum(i['edit'] for i in shots) + sum(i['glitch_dur'] for i in flashes) + 4.4 + 4.2
joins = len(items) + 2 - 1
print(f'rough length {total:.0f}s before dissolves, {len(items) + 2} pieces, ~{total - joins * 0.9:.0f}s after')
print('WROTE', out)
