"""8 Oct 2026: $0 safety net for the film #9 shots whose Kling clip failed QC (first pass REJECT): a still-motion shot built
from the frame Elena APPROVED (film #7's tool, scripts/atuona-still-motion.py: Depth Anything V2 parallax + atmosphere).
The face cannot drift, nobody can speak or kiss, nothing new can appear. Clips are kept; these are additional files in
stillclips/. Run on Oracle ~/atuona-film9:  python3 film9_still_motion_fallbacks_2026-10-08.py  -> sm/specs/*.json"""
import json, os

def E(cx, cy, rx, ry, f=0.08):
    return {'ellipse': [cx, cy, rx, ry], 'feather': f}

def R(x0, y0, x1, y1, f=0.06):
    return {'rect': [x0, y0, x1, y1], 'feather': f}

GRAIN = 0.012
S = {
    # 30: the lilac dawn light on his throat breathes; red slats glow; a slow push toward the two faces
    'k30': dict(look=[[0.5, 0.36], [0.52, 0.33]], zoom=[1.0, 1.06], truck=[[6, 0], [-6, 0]], fx=[
        {'type': 'flicker', 'mask': E(0.53, 0.43, 0.07, 0.09), 'amp': 0.09, 'speed': 0.35},
        {'type': 'flicker', 'mask': R(0.0, 0.4, 0.2, 0.95), 'amp': 0.05, 'speed': 0.8},
        {'type': 'flicker', 'mask': R(0.84, 0.4, 1.0, 0.95), 'amp': 0.05, 'speed': 0.7}]),
    # 7: scales on black sand under the moon; the sea shimmers, the scales glint, nothing moves on the sand
    'k07b': dict(look=[[0.55, 0.55], [0.5, 0.52]], zoom=[1.0, 1.05], truck=[[8, 0], [-8, 0]], fx=[
        {'type': 'shimmer', 'mask': R(0.0, 0.12, 1.0, 0.55), 'amp': 1.2, 'wl': 120, 'period': 4.5},
        {'type': 'flicker', 'mask': E(0.42, 0.62, 0.22, 0.14), 'amp': 0.07, 'speed': 2.2},
        {'type': 'flicker', 'mask': E(0.51, 0.05, 0.04, 0.05), 'amp': 0.03, 'speed': 0.5}]),
    # 11: the mirror; crimson lamps breathe; a slow push toward the reflection
    'k11': dict(look=[[0.36, 0.42], [0.33, 0.38]], zoom=[1.0, 1.06], truck=[[5, 0], [-5, 0]], fx=[
        {'type': 'flicker', 'mask': E(0.05, 0.33, 0.06, 0.1), 'amp': 0.06, 'speed': 1.4},
        {'type': 'flicker', 'mask': E(0.9, 0.37, 0.07, 0.1), 'amp': 0.06, 'speed': 1.2}]),
    # 14: storm, the clasp; rain falls, lanterns flicker, the lightning breathes
    'k14': dict(look=[[0.5, 0.35], [0.5, 0.32]], zoom=[1.0, 1.05], truck=[[5, 0], [-5, 0]], fx=[
        {'type': 'drips', 'region': [0, 0, 1, 1], 'count': 140, 'vel': [0.0, 1.1], 'amp': 0.45, 'len': 18, 'light_gated': False, 'color': '#dfe6f0'},
        {'type': 'flicker', 'mask': E(0.14, 0.47, 0.04, 0.06), 'amp': 0.07, 'speed': 2.0},
        {'type': 'flicker', 'mask': E(0.93, 0.31, 0.04, 0.07), 'amp': 0.07, 'speed': 1.8},
        {'type': 'flicker', 'mask': E(0.88, 0.8, 0.06, 0.1), 'amp': 0.07, 'speed': 1.6},
        {'type': 'flicker', 'mask': E(0.86, 0.14, 0.05, 0.16), 'amp': 0.12, 'speed': 3.0}]),
    # 20: the auction; candle bokeh breathes; a slow push toward her face
    'k20': dict(look=[[0.3, 0.4], [0.3, 0.33]], zoom=[1.0, 1.06], truck=[[6, 0], [-6, 0]], fx=[
        {'type': 'flicker', 'mask': R(0.32, 0.0, 1.0, 0.6), 'amp': 0.05, 'speed': 1.3},
        {'type': 'dust', 'region': [0.3, 0.0, 1.0, 0.7], 'count': 60, 'amp': 0.5, 'size': 1.4}]),
    # 22: Ule at the night window; rain on the glass, the lamp breathes, the bay lights tremble
    'k22': dict(look=[[0.48, 0.4], [0.45, 0.36]], zoom=[1.0, 1.05], truck=[[6, 0], [-6, 0]], fx=[
        {'type': 'drips', 'region': [0.73, 0.0, 1.0, 0.8], 'count': 50, 'vel': [0.0, 0.5], 'amp': 0.5, 'len': 10, 'light_gated': False, 'color': '#e8eef5'},
        {'type': 'flicker', 'mask': E(0.12, 0.52, 0.05, 0.12), 'amp': 0.07, 'speed': 1.5},
        {'type': 'shimmer', 'mask': R(0.4, 0.45, 0.74, 0.66), 'amp': 1.0, 'wl': 90, 'period': 3.5}]),
    # 25: macro, salt on skin; the red club light pulses like a slow heartbeat
    'k25m': dict(look=[[0.45, 0.4], [0.47, 0.38]], zoom=[1.0, 1.04], truck=[[3, 0], [-3, 0]], fx=[
        {'type': 'flicker', 'mask': E(0.5, 0.25, 0.45, 0.3, 0.2), 'amp': 0.08, 'speed': 0.4}]),
    # 26: the carved moonlight lace breathes over them
    'k26': dict(look=[[0.5, 0.35], [0.48, 0.32]], zoom=[1.0, 1.05], truck=[[5, 0], [-5, 0]], fx=[
        {'type': 'flicker', 'mask': R(0.45, 0.3, 1.0, 1.0, 0.12), 'amp': 0.07, 'speed': 0.25},
        {'type': 'flicker', 'mask': R(0.9, 0.0, 1.0, 0.6), 'amp': 0.05, 'speed': 0.3}]),
    # 34: dawn on the beach; the sea shimmers, mist drifts
    'k34': dict(look=[[0.5, 0.45], [0.5, 0.42]], zoom=[1.0, 1.05], truck=[[8, 0], [-8, 0]], fx=[
        {'type': 'shimmer', 'mask': R(0.0, 0.45, 0.55, 0.64), 'amp': 1.0, 'wl': 110, 'period': 4.0},
        {'type': 'flow', 'mask': R(0.4, 0.28, 0.85, 0.55, 0.12), 'amp': 3.0, 'rise': 6.0, 'wl': 120}]),
    # 36: her on black sand in the closed foam ring; the foam fizzes, mist drifts
    'k36': dict(look=[[0.5, 0.42], [0.5, 0.36]], zoom=[1.0, 1.06], truck=[[5, 0], [-5, 0]], fx=[
        {'type': 'shimmer', 'mask': R(0.24, 0.74, 0.76, 1.0), 'amp': 1.2, 'wl': 60, 'period': 3.0},
        {'type': 'flow', 'mask': R(0.0, 0.18, 1.0, 0.55, 0.12), 'amp': 3.0, 'rise': 5.0, 'wl': 140}]),
}
os.makedirs('sm/specs', exist_ok=True)
for name, s in S.items():
    spec = {'base_dir': os.path.expanduser('~/atuona-film9'), 'dur': 10, 'fps': 24, 'size': [1920, 1080], 'grain': GRAIN,
            'vignette': 0.12, 'out': f'stillclips/sm_{name}.mp4',
            'shots': [{'img': f'img/{name}.jpg', 'depth': f'sm/depth/{name}.png', 'look': s['look'], 'zoom': s['zoom'],
                       'truck': s['truck'], 'focal': 0.55, 'dolly': 0.03, 'ease': 0.6, 'fx': s['fx']}]}
    json.dump(spec, open(f'sm/specs/{name}.json', 'w'), indent=1)
print(' '.join(S))
