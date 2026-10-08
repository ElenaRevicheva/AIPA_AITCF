"""8 Oct 2026, Elena: "15, 22, 24 is okay but it looks like painted again - it is not realistic human quality".
Realism-pass test on k24 (Ule crying, close-up — the hardest case): the same edit instruction on three edit engines, the
frame itself as the only reference. A local film-emulation variant is made separately ($0). Run on Oracle ~/atuona-film9."""
import json

p = json.load(open('plan.json'))
REAL = ('Turn this image into a real, unretouched documentary photograph of a real man, as if shot on a 35mm film camera with '
        'available light. Keep the same man, the same face and identity, the same expression, pose, framing, wet eyes and '
        'background. Change only the rendering: real human skin with visible pores, fine lines, small blemishes, stubble with '
        'individual hairs, natural oily shine instead of glossy highlights, slight asymmetry, natural muted film colour, soft '
        'realistic contrast, real film grain, a touch of lens softness. Not painted, not airbrushed, not CGI, not HDR, not '
        'digital art, no smooth plastic skin.')
for suffix, model in (('n', 'nano-banana-pro-edit'), ('s', 'seedream-v5-pro-edit'), ('f', 'flux-2-max-edit')):
    p['images'][f'k24r{suffix}'] = {'engine': 'venice', 'vmodel': model, 'refs': ['k24'], 'aspect': '16:9', 'prompt': REAL,
                                    'look': False, 'note': f'8 Oct realism-pass test on k24 ({model})'}
json.dump(p, open('plan.json', 'w'), indent=1, ensure_ascii=False)
print('realism test entries added')
