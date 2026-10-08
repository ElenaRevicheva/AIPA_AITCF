"""8 Oct 2026: render the impressionist redesign (workflow wf_5482a0d3-4ae, film9_impressionist_redesign_2026-10-08.json) for
M1, M2, 30, 31 on Seedream V5 Pro edit (realism standard; prompts already carry the realism wording). 15 is skipped (Elena
approved it). Plus: remove the small frangipani flower from k10a (she rejected flowers in k09). Run on Oracle ~/atuona-film9."""
import json

p = json.load(open('plan.json'))
R = json.load(open('film9_impressionist_redesign_2026-10-08.json', encoding='utf-8'))
NAME = {'M1': 'M1i', 'M2': 'M2i', '30': 'k30i', '31': 'k31i'}
for s in R['shots']:
    if s['id'] not in NAME:
        continue
    assert len(s['prompt']) <= 1500, s['id']
    p['images'][NAME[s['id']]] = {'engine': 'venice', 'vmodel': 'seedream-v5-pro-edit', 'refs': s['refs'], 'aspect': '16:9',
                                  'prompt': s['prompt'], 'look': False,
                                  'note': f"8 Oct impressionist redesign {s['id']}: {s['other_reality'][:180]}"}
p['images']['k10a_nf'] = {'engine': 'venice', 'vmodel': 'seedream-v5-pro-edit', 'refs': ['k10a'], 'aspect': '16:9', 'look': False,
    'prompt': ('Edit this photograph. Remove the small white-and-yellow flower lying on the white sheet completely, replacing it '
               'with the same soft white sheet folds in the same shadow. Change nothing else: the same woman, face, eyes, hair, '
               'bare shoulder, honey stripe of light, shutters, sheet, colour and grain, exactly as they are.'),
    'note': '8 Oct: k10a with the frangipani removed (Elena dislikes flowers in frame)'}
json.dump(p, open('plan.json', 'w'), indent=1, ensure_ascii=False)
print('entries added:', list(NAME.values()) + ['k10a_nf'])
