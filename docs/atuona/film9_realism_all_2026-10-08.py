"""8 Oct 2026: realism pass (blind-panel standard: Seedream V5 Pro edit + fixed instruction) on every approved frame that has
not had it yet, before motion. Originals are untouched; results are <frame>_real.jpg and replace nothing until Elena OKs them.
k17b (red dog on green, a keying plate) is skipped. Run on Oracle ~/atuona-film9."""
import json

p = json.load(open('plan.json'))
FRAMES = ['k01a', 'k01b', 'k02', 'k05', 'k06', 'k07b', 'k07m', 'k09', 'k11', 'k13', 'k14', 'k16m', 'k17a', 'k18', 'k19',
          'k20', 'k20b', 'k21', 'k25m', 'k26', 'k27', 'k28m', 'k32m', 'k34', 'k36', 'k37']
REALISM = ('Turn this image into a real, unretouched documentary photograph, as if shot on a 35mm film camera with the light '
           'already in the scene. Keep EXACTLY the same image: composition, framing, every person with the same face, identity, '
           'expression, body and pose, every object, the setting, the time of day and the colours of the light. Change only '
           'the rendering: real skin with visible pores, fine lines and small imperfections where people appear; natural '
           'matte skin with only a light natural sheen where it is wet, no oiled or lacquered gloss; hair and fabric as soft '
           'natural textures; natural muted film colour, soft lifted blacks, gentle realistic light falloff, real film grain, '
           'a touch of lens softness. Any tears or water drops are clear and transparent. Not painted, not airbrushed, not CGI, '
           'not HDR, not over-sharpened, not digital art. Add nothing and remove nothing.')
for f in FRAMES:
    p['images'][f'{f}_real'] = {'engine': 'venice', 'vmodel': 'seedream-v5-pro-edit', 'refs': [f], 'aspect': '16:9',
                                'prompt': REALISM, 'look': False,
                                'note': f'8 Oct realism pass on approved {f}; replaces nothing until Elena OKs'}
json.dump(p, open('plan.json', 'w'), indent=1, ensure_ascii=False)
print(' '.join(f'{f}_real' for f in FRAMES))
