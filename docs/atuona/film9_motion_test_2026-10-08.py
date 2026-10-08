"""8 Oct 2026: film #9 motion test, 3 shots on Venice Kling O3 before the full motion run (Elena agreed: one 4K + two Pro,
about $4, so she sees real moving footage before the rest is spent). Directions come from film9_motion_directions_2026-10-08.json
(workflow wf_7aa00698-68e), with two edits: shot 13 loses its "oil paint" wording (she rejects any painted look) and M3 loses
the flower clause. Each entry starts from the frame she approved. Run on Oracle ~/atuona-film9."""
import json

p = json.load(open('plan.json'))
D = {s['shot']: s for s in json.load(open('film9_motion_directions_2026-10-08.json', encoding='utf-8'))['shots']}
FIX = {
    '13': [('Impressionist: the lantern glow smears into the wet dusk like warm copper oil paint, the storm sky shimmering '
            'like a freshly painted canvas.',
            'The lantern glow blooms into soft warm copper halos in the wet dusk air, and the storm sky behind shifts slowly '
            'between bruised violet and pale gold, a light that does not match the hour.')],
    'M3': [('; the frangipani petals tremble', '')],
}
TEST = {'13': 'v13', '30': 'v30', 'M3': 'vM3'}
for shot, sid in TEST.items():
    d = D[shot]
    motion = d['motion']
    for a, b in FIX.get(shot, []):
        assert a in motion, (shot, a[:40])
        motion = motion.replace(a, b)
    assert 'paint' not in motion.lower(), shot
    p['shots'][sid] = {'start': d['frame'], 'engine': 'venice', 'duration': d['clip_seconds'],
                       'motion': motion + ' Keep: ' + d['keep_still'],
                       'note': f"8 Oct motion test {shot} ({d['tier']}): edit {d['edit_seconds']} s at x{d['slow_factor']}"}
    print(sid, d['frame'], d['tier'], d['clip_seconds'], 's', len(p['shots'][sid]['motion']) + len(p['motion_look']), 'chars')
json.dump(p, open('plan.json', 'w'), indent=1, ensure_ascii=False)
