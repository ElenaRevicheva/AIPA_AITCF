"""8 Oct 2026, Elena: "he should look sexy, more physically man looking, he should have hair in dreads, now he is thin and tall
man and bold - it is not our way to go". New Jean-Marc: Black French, sexy, muscular and broad, dreadlocks, charismatic with a
dangerous, knowing half-smile ("more bastardy" kept), wealthy art collector. Original man (no real-person likeness).
Seedream V5 Pro (realism standard). Run on Oracle ~/atuona-film9."""
import json

p = json.load(open('plan.json'))
REAL = ('Real unretouched documentary photograph on 35mm film, available light, visible skin pores, natural imperfection, '
        'muted film colour, soft lifted blacks, real grain; not airbrushed, not CGI, not HDR, not painted. ')
MAN = ('An original, non-famous, very sexy French man with Black roots, about 40-45, a rich and powerful Paris art '
       'collector: strongly built and physically masculine — broad shoulders, a strong chest and neck, powerful arms, an '
       'athletic heavy frame, not thin; deep brown skin; strong handsome face with a defined jaw and full lips; dark intense '
       'eyes; a slow, dangerous, knowing half-smile — confident, seductive, a little cruel, a man who owns what he looks at. ')
V = {
    'l1': 'Shoulder-length dreadlocks pulled back loosely, a short well-groomed beard. Black silk shirt open at the chest under '
          'a dark tailored jacket. Chest-up portrait, 16:9, face sharp, eyes to camera, hands out of frame. Warm low side light, '
          'dark background.',
    'l2': 'Long dreadlocks worn loose over his shoulders, clean-shaven. Fitted black shirt with sleeves rolled up over strong '
          'forearms, collar open. Waist-up portrait, 16:9, arms folded loosely, face sharp, eyes to camera. Dim Paris loft, '
          'window light.',
    'l3': 'Thick dreadlocks tied half-up, a neatly trimmed beard. White linen shirt open on his chest, a thin gold chain. '
          'Chest-up portrait, 16:9, face sharp, eyes to camera, hands out of frame. Late-afternoon island light on a terrace, '
          'sea out of focus behind him.',
}
for k, extra in V.items():
    p['images'][f'cast_jean7_{k}'] = {'engine': 'venice', 'vmodel': 'seedream-v5-pro', 'refs': [], 'aspect': '16:9',
                                      'prompt': REAL + MAN + extra + ' No text, no logos.', 'look': False,
                                      'note': '8 Oct Jean-Marc new direction: sexy, muscular, dreadlocks (Elena); original man'}
json.dump(p, open('plan.json', 'w'), indent=1, ensure_ascii=False)
print('entries added')
