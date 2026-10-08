"""Film #9 Mila & Jean-Marc sequence (Elena 7-8 Oct 2026: "Yes, go" — all 5 shots as designed in
FILM9_MILA_JEAN_SEQUENCE_2026-10-07.md / film9_mila_jean_sequence_2026-10-07.json).
Stage 1 (--cast): cast portraits for Mila and Jean-Marc on two engines (Seedream V5 Pro + Nano Banana Pro, text only).
Stage 2 (--shots MILA JEAN): the 5 stills M1-M5 on Seedream V5 Pro edit (her preferred realism engine) and qwen-edit-uncensored,
with the chosen cast portraits as references. Run on Oracle from ~/atuona-film9 with the json next to it."""
import json, sys

p = json.load(open('plan.json'))
F = json.load(open('film9_mila_jean_sequence_2026-10-07.json', encoding='utf-8'))
look = ('Unretouched photograph on 35mm film, real skin with pores, natural asymmetry, practical light only, film grain; '
        'not CGI, not a painting, no airbrushing.')

if '--cast' in sys.argv:
    for who, key in (('mila', 'mila'), ('jean', 'jean_marc')):
        for suffix, model in (('s', 'seedream-v5-pro'), ('n', 'nano-banana-pro')):
            p['images'][f'cast_{who}_{suffix}'] = {
                'engine': 'venice', 'vmodel': model, 'refs': [], 'aspect': '16:9', 'prompt': F['cast'][key], 'look': look,
                'note': f'8 Oct: {key} cast portrait derived only from her text (#082-#086); pick the more realistic of s/n'}
    print('cast entries added')

if '--shots' in sys.argv:
    mila, jean = sys.argv[sys.argv.index('--shots') + 1], sys.argv[sys.argv.index('--shots') + 2]
    REFS = {'M1': ['kira', mila, jean], 'M2': ['kira', mila, jean], 'M3': [mila, jean], 'M4': [mila, jean], 'M5': ['kira', mila]}
    for s in F['shots']:
        assert len(s['prompt']) + len(look) + 1 <= 1500, (s['id'], len(s['prompt']))
        for suffix, model in (('s', 'seedream-v5-pro-edit'), ('q', 'qwen-edit-uncensored')):
            p['images'][f"{s['id']}{suffix}"] = {
                'engine': 'venice', 'vmodel': model, 'refs': REFS[s['id']], 'aspect': '16:9', 'prompt': s['prompt'],
                'look': look,
                'note': f"8 Oct Mila/Jean sequence {s['id']} '{s['title']}' — line: {s['line'][:120]} | surreal: {s['surreal_detail'][:140]}"}
    print('shot entries added with refs', REFS)

json.dump(p, open('plan.json', 'w'), indent=1, ensure_ascii=False)
