"""8 Oct 2026, Elena: "move on with video compilation - do not wipe anything in videos already approved" and "all the frames
already approved by me should stay and be video compiled". Full motion run for film #9: every remaining shot of the 4:30 cut on
Venice Kling O3 Pro (1080p; same face hold as 4K in the 6 Oct bake-off; the film is mastered at 1080p, and Pro leaves ~$16 of
her $60 for re-takes). Start frame = the frame she approved (plan.json final_frames_4m30; realism versions only where she
approved them: 15, 22, 24 already live as img/k15, k22, k24). Already rendered and kept as they are: v13 (4K), v30, vM3.
v30b = one re-take of 30 with her head locked (v30 brought her lips to his jaw; no Kira/Ule kiss), v30 is kept beside it.

Painterly similes are taken out of the directions (her rule: nothing may look painted); the light, colour and atmosphere stay.
Run on Oracle ~/atuona-film9 next to film9_motion_directions_2026-10-08.json."""
import json, re

p = json.load(open('plan.json'))
D = {s['shot']: s for s in json.load(open('film9_motion_directions_2026-10-08.json', encoding='utf-8'))['shots']}
FIX = {
    '1a': [(', like wet paint drying', '')],
    '2': ([(' like wet paint behind the frost', ' behind the frost')]),
    '6': [('breaking into silver brushstrokes', 'breaking into trembling silver flecks')],
    '7': [(', like an Impressionist sea', '')],
    '7m': [('ripples in silver brushstrokes', 'ripples in broken silver light')],
    '10a': [('like a brushstroke of honey', 'like poured honey')],
    '10b': [('like a brushstroke of honey', 'like poured honey')],
    'M1': [('smear and shimmer like wet, unblended oil strokes in heat haze', 'smear and shimmer in heat haze')],
    '14': [('Impressionist: rain-light runs over her skin like wet brushstrokes.',
            'Rain-light runs over her skin in soft trembling streaks.')],
    '17': [('so the air trembles like wet paint', 'so the air trembles')],
    '20b': [('faint Gauguin colours (ochre, rose, deep green) blooming in the stains like a fresco surfacing, then sinking back',
             'faint warm colours (ochre, rose, deep green) blooming inside the stains like old colour rising through damp '
             'plaster, then sinking back'),
            ('no figures, faces or images painted on the wall', 'no figures, faces or images appearing on the wall')],
    '22': [('smear into soft impressionist strokes on the water', 'smear into soft trembling streaks on the water')],
    '25': [('its edge bleeding warm like watercolour', 'its edge bleeding warm and soft')],
    '26': [('breathing brighter and dimmer like brushwork', 'breathing brighter and dimmer')],
    '27': [('softening like wet paint', 'softening')],
    '34': [(' like a Monet sky', '')],
    '36': [('glowing faintly lilac like a brushstroke', 'glowing faintly lilac')],
    '37': [('shimmers like wet paint and fades', 'shimmers and fades')],
}
PAINT = re.compile(r'\b(paint\w*|brush ?strokes?|brushwork|canvas|impressionis\w*|oil strokes?|watercolou?r|monet|gauguin|fresco)\b', re.I)
DONE = {'13', '30', 'M3'}
ids = []
for shot, d in D.items():
    if shot in DONE:
        continue
    motion, keep = d['motion'], d['keep_still']
    for a, b in FIX.get(shot, []):
        assert a in motion or a in keep, (shot, a[:50])
        motion, keep = motion.replace(a, b), keep.replace(a, b)
    bad = PAINT.findall(motion + ' ' + keep)
    assert not bad, (shot, bad)
    sid = 'v' + shot
    p['shots'][sid] = {'start': d['frame'], 'engine': 'venice', 'duration': d['clip_seconds'],
                       'motion': motion + ' Keep: ' + keep,
                       'note': f"8 Oct full motion run {shot}: Kling O3 Pro, edit {d['edit_seconds']} s at x{d['slow_factor']}"}
    ids.append(sid)
d = D['30']
p['shots']['v30b'] = {'start': d['frame'], 'engine': 'venice', 'duration': 5,
    'motion': ('Near-still. Her head is locked in place for the whole shot: it does not move toward him at all, and the visible '
               'gap of air between her parted lips and his throat stays exactly as wide as in the first frame. No kiss, no '
               'nuzzle, no contact of lips or nose with his skin, no speaking. He stays utterly still, head back against the '
               'carving, eyes open; only his throat moves with one slow breath. The small pool of cool lilac-white dawn light '
               'on his throat slowly breathes brighter, then softens. The crimson and honey bars from the low slats shimmer '
               'with heat. Wet curls stir. Her strap stays up. Camera locked, very slow push-in. Keep: ' + d['keep_still']),
    'note': '8 Oct re-take of 30: v30 brought her lips to his jaw (no Kira/Ule kiss); v30 kept beside it'}
ids.append('v30b')
json.dump(p, open('plan.json', 'w'), indent=1, ensure_ascii=False)
open('motion_run_ids.txt', 'w').write('\n'.join(ids) + '\n')
print(len(ids), 'entries:', ' '.join(ids))
