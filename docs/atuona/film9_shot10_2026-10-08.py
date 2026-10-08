"""8 Oct 2026, Elena: "yes, do both" — shots 10a (Heat) and 10b (Air) from her poem #078. Light-only motion, sheet at the
shoulder blades (scenario production note); the "other reality" is impressionist: honey light like brushwork, air you can
taste. Seedream V5 Pro edit with Kira's locked face (realism standard). Run on Oracle ~/atuona-film9."""
import json

p = json.load(open('plan.json'))
REAL = ('Real unretouched photograph on 35mm film, available morning light only, real skin with pores and fine downy hair, '
        'natural matte skin with a faint warm sheen of heat, muted film colour, soft lifted blacks, real grain; not painted, '
        'not airbrushed, not CGI, not HDR. ')
K = ('the woman from the reference image (same face, grey-green eyes, glossy true-black wavy curly hair spread on the pillow, '
     'never blue, pale skin, full lips, a faint pale healed hairline scar through her left eyebrow), about 34')
SHOTS = {
    'k10a': (f'Atuona morning, a white bed in a dim tropical room with wooden louvred shutters, one shutter half open. {K} lies '
             'on her side, still, eyes half-open, waking into the heat; the white sheet clings to her body up to the shoulder '
             'blades, her bare shoulder and arm uncovered. A single narrow stripe of thick golden honey-coloured sunlight falls '
             'through the shutter across the sheet and onto her bare shoulder, warm and dense like poured honey, the light '
             'itself looking almost painted, like an Impressionist brushstroke, while everything else stays real. The air is '
             'hazy and warm, with faint golden dust and a frangipani blossom fallen on the floorboards. Sensual, quiet, adult, '
             'not explicit: bare shoulder and arm only. 16:9.'),
    'k10b': (f'The same Atuona morning, the same white bed, seen from behind and slightly above. {K} lies on her front, '
             'face turned to the side on the pillow, eyes closed, lips parted in a slow breath; the white sheet has slipped to '
             'just below her shoulder blades, her bare back and shoulders uncovered. The narrow stripe of golden honey-coloured '
             'light from the shutter has travelled up and now rests across her shoulder blade; where it touches, her skin '
             'glows warm, fine downy hairs lit gold, as if the light were breathing on her. Hazy warm air, soft shadows of the '
             'louvres. Sensual, tender, adult, not explicit: bare back and shoulders only, nothing frontal. 16:9.'),
}
for k, prompt in SHOTS.items():
    assert len(prompt) + len(REAL) <= 1500, (k, len(prompt))
    p['images'][k] = {'engine': 'venice', 'vmodel': 'seedream-v5-pro-edit', 'refs': ['kira'], 'aspect': '16:9',
                      'prompt': REAL + prompt, 'look': False,
                      'note': '8 Oct shot 10 from #078 (Elena: do both 10a and 10b); light-only, impressionist honey light'}
json.dump(p, open('plan.json', 'w'), indent=1, ensure_ascii=False)
print('entries added: k10a k10b')
