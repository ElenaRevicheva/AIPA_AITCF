"""8 Oct 2026: Jean-Marc recast (Elena: "a beautiful Jean - french man but much more charismatic"). Two designs from workflow
wf_cea7bc47-cf5 (film9_jean_recast_2026-10-08.json), each on nano-banana-pro and seedream-v5-pro. Run on Oracle ~/atuona-film9."""
import json
p = json.load(open('plan.json'))
R = json.load(open('film9_jean_recast_2026-10-08.json', encoding='utf-8'))
for pick in ('a', 'b'):
    for suffix, model in (('n', 'nano-banana-pro'), ('s', 'seedream-v5-pro')):
        p['images'][f'cast_jean2{pick}_{suffix}'] = {'engine': 'venice', 'vmodel': model, 'refs': [], 'aspect': '16:9',
            'prompt': R[f'pick_{pick}']['prompt'], 'look': False,
            'note': f"8 Oct Jean-Marc recast pick {pick.upper()}: {R[f'pick_{pick}']['label']}"}
json.dump(p, open('plan.json', 'w'), indent=1, ensure_ascii=False)
print('jean recast entries added')
