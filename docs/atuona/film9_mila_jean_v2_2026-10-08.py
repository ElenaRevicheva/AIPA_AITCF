"""8 Oct 2026: Elena picked Jean-Marc L3 (locs half-up, trimmed beard, white linen shirt open, gold chain; sexy, masculine,
Black French) -> img/jean.jpg. Re-render M1-M4 with him on Seedream V5 Pro edit (realism standard); his wardrobe in the prompts
changes from the old pale stone-grey suit to white linen. M1 then gets the bronze walking-figure edit again (nano). M5 has no
Jean-Marc and stays. Run on Oracle ~/atuona-film9 next to film9_mila_jean_sequence_2026-10-07.json."""
import json

p = json.load(open('plan.json'))
F = json.load(open('film9_mila_jean_sequence_2026-10-07.json', encoding='utf-8'))
look = ('Unretouched photograph on 35mm film, real skin with pores, natural matte skin, muted film colour, soft lifted '
        'blacks, practical light only, film grain; not CGI, not painted, not HDR, no airbrushing.')
JEAN = 'with thick dreadlocks tied half-up and a trimmed beard'
SWAP = [('pale stone-grey summer suit', 'white linen shirt open on his chest, a thin gold chain'),
        ('pale stone-grey suit', 'white linen shirt open on his chest'),
        ('pale stone-grey cuff', 'rolled white linen sleeve'),
        ('manicured hand', 'strong dark hand')]
REFS = {'M1': ['kira', 'mila', 'jean'], 'M2': ['kira', 'mila', 'jean'], 'M3': ['mila', 'jean'], 'M4': ['mila', 'jean']}
WHO = {'M1': 'the man from the third reference image', 'M2': 'the man from the third reference image',
       'M3': 'the man from the second reference image', 'M4': 'the man from the second reference image'}
for s in F['shots']:
    if s['id'] not in REFS:
        continue
    prompt = s['prompt']
    for a, b in SWAP:
        prompt = prompt.replace(a, b)
    prompt = prompt.replace(WHO[s['id']], f"{WHO[s['id']]} ({JEAN})", 1)
    assert 'stone-grey' not in prompt, s['id']
    assert len(prompt) + len(look) + 1 <= 1500, (s['id'], len(prompt))
    p['images'][f"{s['id']}j"] = {'engine': 'venice', 'vmodel': 'seedream-v5-pro-edit', 'refs': REFS[s['id']], 'aspect': '16:9',
                                  'prompt': prompt, 'look': look,
                                  'note': f"8 Oct {s['id']} re-rendered with Jean-Marc L3 (white linen, locs half-up)"}
p['images']['M1jf'] = dict(p['images']['M1f'], refs=['M1j'],
                           note='8 Oct: bronze walking-figure edit (nano) on M1j with the new Jean-Marc')
json.dump(p, open('plan.json', 'w'), indent=1, ensure_ascii=False)
print('entries added: M1j M2j M3j M4j M1jf')
