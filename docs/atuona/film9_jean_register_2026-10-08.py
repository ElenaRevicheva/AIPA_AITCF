"""8 Oct 2026, Elena: "explore how singer Seal looks like - Jean should be similar".
Policy: no lookalike of a real person (consent; Venice terms ban using a likeness without consent). We take the REGISTER
only — tall, lean, shaved head, very dark skin, sculpted cheekbones, deep-set soulful eyes, calm stillness, quiet tailored
elegance — as an ORIGINAL man, with none of a real person's identifying features (no facial scarring). Three variants,
Seedream V5 Pro (the realism standard). Run on Oracle from ~/atuona-film9."""
import json

p = json.load(open('plan.json'))
BASE = ('Real unretouched documentary photograph on 35mm film, available window light, visible skin pores, natural '
        'imperfection, muted film colour, soft lifted blacks, real grain; not airbrushed, not CGI, not HDR, not painted. '
        'Chest-up cast reference portrait, 16:9, face sharp, eyes to camera, hands out of frame. An original, non-famous '
        'French man with Black roots, a very wealthy Paris art collector: very tall and lean, long neck, upright unhurried '
        'posture; smooth clean-shaven head; very dark skin with a natural soft sheen; high sculpted cheekbones, strong jaw, '
        'deep-set dark eyes with a calm, soulful, slightly melancholic and dangerous gaze; charisma from stillness, a faint '
        'private half-smile, a man used to being watched and to owning what he looks at; clear smooth skin on the face. ')
V = {
    'r1': 'About 45. Midnight-black tailored suit, black silk shirt open at the collar, no tie. Plain dark warm-grey wall.',
    'r2': 'About 42. Very short neat salt-free goatee. Charcoal unstructured jacket over an ivory silk shirt open at the '
          'throat. Dim Paris salon background, tall window, soft daylight.',
    'r3': 'About 48. Deep navy double-breasted jacket worn open over a white shirt, collar open, a thin gold chain barely '
          'visible. Dark museum-gallery background, one framed painting out of focus.',
}
for k, extra in V.items():
    p['images'][f'cast_jean4_{k}'] = {'engine': 'venice', 'vmodel': 'seedream-v5-pro', 'refs': [], 'aspect': '16:9',
                                      'prompt': BASE + extra + ' No text, no logos.', 'look': False,
                                      'note': '8 Oct Jean-Marc in the register Elena admires (tall, lean, shaved head, soulful, '
                                              'calm), ORIGINAL man, no real-person likeness'}
json.dump(p, open('plan.json', 'w'), indent=1, ensure_ascii=False)
print('entries added')
