"""8 Oct 2026, Elena: "make him more bastardy" — on the pushed R-man (P1, P2, P3). Same original man, his own face; attitude
only: cruel amusement, predatory appraising gaze, arrogance, owning the room. No props (her rule: no generic stock props).
Seedream V5 Pro edit (realism standard). Run on Oracle ~/atuona-film9."""
import json

p = json.load(open('plan.json'))
REAL = ('Real unretouched documentary photograph on 35mm film, available light, visible skin pores, natural imperfection, '
        'muted film colour, soft lifted blacks, real grain; not airbrushed, not CGI, not HDR, not painted. ')
SAME = 'Keep exactly the same man as the reference image: his own face, head, skin, build and suit. Change only his attitude: '
V = {
    'b1': ('cast_jean5_p1', 'he is an arrogant, dangerous bastard who knows it — chin raised, looking down his nose straight '
           'into the lens, one eyebrow slightly lifted, a slow cruel amused smirk at one corner of the mouth, heavy-lidded '
           'predatory eyes that appraise and dismiss you at once; collar of the black silk shirt open low on his chest. '
           'Chest-up, 16:9, hands out of frame.'),
    'b2': ('cast_jean5_p3', 'he is a cold, amused bastard — three-quarter profile, a slow sideways look into the lens from the '
           'corner of his eyes, faint contempt and private amusement, lips pressed into a thin knowing smirk, absolutely '
           'still. Low warm side light, deep shadow. Chest-up, 16:9.'),
    'b3': ('cast_jean5_p2', 'he is a magnetic bastard who owns the room — leaning one shoulder against the gallery doorframe, '
           'jacket open, black silk shirt open low, head tilted, looking at the camera with a mocking half-smile as if he '
           'has already bought you and is deciding what you are worth. Full length, 16:9, face readable.'),
}
for k, (ref, attitude) in V.items():
    p['images'][f'cast_jean6_{k}'] = {'engine': 'venice', 'vmodel': 'seedream-v5-pro-edit', 'refs': [ref], 'aspect': '16:9',
                                      'prompt': REAL + SAME + attitude + ' No text, no logos.', 'look': False,
                                      'note': f'8 Oct Jean-Marc "more bastardy" pass on {ref}; original man, no likeness'}
json.dump(p, open('plan.json', 'w'), indent=1, ensure_ascii=False)
print('entries added')
