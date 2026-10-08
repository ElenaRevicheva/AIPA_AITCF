"""8 Oct 2026, Elena chose option 1: "The R-man, pushed further: taller and leaner, an even more angular face, deeper-set eyes,
more stillness, and the same soulful gravity, but his own face." Reference = cast_jean4_r1 (the same original man).
No real-person likeness; no facial scarring. Seedream V5 Pro edit (realism standard). Run on Oracle ~/atuona-film9."""
import json

p = json.load(open('plan.json'))
REAL = ('Real unretouched documentary photograph on 35mm film, available light, visible skin pores, natural imperfection, '
        'muted film colour, soft lifted blacks, real grain; not airbrushed, not CGI, not HDR, not painted. ')
MAN = ('The same man as the reference image, his own face and identity, pushed further: even taller and leaner, long limbs '
       'and a long neck; an even more angular, sculpted face with sharper cheekbones and a more defined jaw; deeper-set dark '
       'eyes under a strong brow; total stillness, an unhurried upright posture; soulful, grave, quietly dangerous gaze, a '
       'barely-there private half-smile. Smooth clean-shaven head, very dark skin, clear smooth skin on the face. ')
V = {
    'p1': 'Chest-up portrait, 16:9, face sharp, eyes to camera, hands out of frame. Midnight-black tailored suit, black silk '
          'shirt open at the collar. Plain dark warm-grey wall, soft side window light.',
    'p2': 'Full-length portrait, 16:9, standing very still in the tall doorway of a dim Paris gallery, framed paintings out '
          'of focus behind him, his height filling the doorway. Midnight-black tailored suit, black silk shirt open at the '
          'collar, hands loose at his sides. Face readable.',
    'p3': 'Three-quarter profile, chest-up, 16:9, head turned slightly toward camera, eyes on the lens. Low warm side light '
          'from one lamp, deep shadow on the far side of the face. Midnight-black suit, black silk shirt open at the collar.',
}
for k, extra in V.items():
    p['images'][f'cast_jean5_{k}'] = {'engine': 'venice', 'vmodel': 'seedream-v5-pro-edit', 'refs': ['cast_jean4_r1'],
                                      'aspect': '16:9', 'prompt': REAL + MAN + extra + ' No text, no logos.', 'look': False,
                                      'note': '8 Oct Jean-Marc R-man pushed further (Elena option 1); original man, no likeness'}
json.dump(p, open('plan.json', 'w'), indent=1, ensure_ascii=False)
print('entries added')
