"""8 Oct 2026.
(1) Jean-Marc as a French man with Black roots (Elena: "he should be french man with black roots - explore how he may look"):
    four looks J1-J4 from workflow wf_f0ea3308-723 (film9_jean_blackroots_2026-10-08.json), on Seedream V5 Pro (text only).
(2) Realism standard (blind panel, 3/3 judges): Seedream V5 Pro edit with a fixed realism instruction beats nano, Flux,
    film emulation and the original. Applied to k15s, k22, k24 (Elena: "okay but it looks like painted").
    Fix from the judges: tears must be thin, clear, light-catching water — never milky or opaque.
Run on Oracle from ~/atuona-film9."""
import json

p = json.load(open('plan.json'))
J = json.load(open('film9_jean_blackroots_2026-10-08.json', encoding='utf-8'))
for pick in J['picks']:
    p['images'][f"cast_jean3_{pick['id'].lower()}"] = {
        'engine': 'venice', 'vmodel': 'seedream-v5-pro', 'refs': [], 'aspect': '16:9', 'prompt': pick['prompt'], 'look': False,
        'note': f"8 Oct Jean-Marc, French with Black roots: {pick['label']}"}

REALISM = ('Turn this image into a real, unretouched documentary photograph of real people, as if shot on a 35mm film camera '
           'with available light. Keep exactly the same people, faces and identities, expressions, poses, clothes, framing, '
           'setting and every object. Change only the rendering: real human skin with visible pores, fine lines and small '
           'imperfections, natural matte skin with only a light natural sheen where it is wet, no oiled or lacquered gloss, '
           'hair as soft natural strands, natural muted film colour, lifted soft blacks, gentle realistic light falloff, real '
           'film grain, a touch of lens softness. Any tears are thin, clear, transparent water catching the light, never '
           'milky or opaque. Not painted, not airbrushed, not CGI, not HDR, not over-sharpened, not digital art.')
for src in ('k15s', 'k22', 'k24'):
    p['images'][f'{src}_real'] = {'engine': 'venice', 'vmodel': 'seedream-v5-pro-edit', 'refs': [src], 'aspect': '16:9',
                                  'prompt': REALISM, 'look': False,
                                  'note': f'8 Oct realism pass (blind-panel standard) on {src}; Elena: composition OK, looked painted'}
json.dump(p, open('plan.json', 'w'), indent=1, ensure_ascii=False)
print('entries added')
