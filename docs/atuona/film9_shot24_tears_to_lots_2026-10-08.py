"""8 Oct 2026, Elena: "I want an image of crying Ule frame that I approved be turned into video shot also and when tears drop
down they turn to auction lots at Christie's." Start frame = her approved k24 (realism version). Two variants on Venice Kling O3
Pro (10 s): A locked on his face, the lots form in the air; B a slow tilt down onto the lots landing on black velvet. No brand
name in the prompt (models paint logos/lettering; a trademark in a public film) — the room is a grand London saleroom.
v24 (the first clip, his look hardens) is kept. Run on Oracle ~/atuona-film9."""
import json

p = json.load(open('plan.json'))
FACE = ('Extreme close-up of the man from the start frame. His face does not change at all for the whole shot: the same soft, '
        'wounded look, brows slightly raised at the inner corners, eyes open and glistening on the lens, mouth closed and still. '
        'No frown, no glare, no narrowing of the eyes, no sobbing, no speech, no blinking flutter. Same face, same age, same '
        'stubble, same wet hair, same cord necklace. ')
ROOM = ('Behind him the warm lamp bokeh glows like the red-walled saleroom of a grand old London auction house during an '
        'evening sale. ')
LOTS = {
    'v24La': FACE + 'One new tear wells in his eye and rolls slowly down the wet trail on his cheek to his jaw, and falls free. '
             'In slow motion, in the air in front of his collarbone, the falling drop turns into a tiny precious auction lot: a '
             'miniature gilt-framed oil painting the size of a fingernail, caught by a pinpoint spotlight, turning slowly as it '
             'falls out of the frame. A second tear follows from the other eye and, as it falls, becomes a tiny necklace of '
             'diamonds with one emerald drop, glittering under its own spotlight as it falls. ' + ROOM +
             'Camera locked. Real photograph in motion, nothing painted; no letters, no numbers, no logos.',
    'v24Lb': FACE + 'One tear rolls slowly down the wet trail on his cheek and drops from his jaw. The camera tilts down very '
             'slowly, following the falling drop past his collarbone into the darkness below, where the drop lands on black '
             'velvet and becomes a precious auction lot under a soft spotlight: a small gilt-framed oil painting resting on the '
             'velvet. Beside it other fallen tears have already become lots: a diamond necklace with one emerald drop, a small '
             'carved dark-wood figure, each glowing in its own pool of light, like the lots of an evening sale. ' + ROOM +
             'Real photograph in motion, nothing painted; no letters, no numbers, no logos.',
}
for sid, motion in LOTS.items():
    p['shots'][sid] = {'start': 'k24', 'engine': 'venice', 'duration': 10, 'motion': motion,
                       'note': "8 Oct Elena: Ule's tears turn into auction lots as they fall (variant " + sid[-1] + ')'}
    print(sid, len(motion) + len(p['motion_look']), 'chars')
json.dump(p, open('plan.json', 'w'), indent=1, ensure_ascii=False)
