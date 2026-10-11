"""11 Oct 2026: kA1d = kA1 with the canvas emptied (Elena chose LOCAL motion after Kling refused vA1: a still-motion push-in
on kA1 dissolving into kA1d - the painting drains from its frame while its colour stays as light; fragment #087: "the painting
isn't there. It remains in the gap between what is and what the artist decided to see"). Run on Oracle in ~/atuona-film9."""
import json, shutil, time
shutil.copy('plan.json', f'plan.json.bak-arearea-d-{time.strftime("%Y%m%d-%H%M%S")}')
plan = json.load(open('plan.json'))
plan['images']['kA1d'] = {
    'engine': 'venice', 'vmodel': 'seedream-v5-pro-edit', 'refs': ['kA1'], 'aspect': '16:9', 'look': False,
    'prompt': ("Image 1, exactly the same photograph, identical in every detail: the same room, the same spotlight and haze, the "
               "same two people standing in the same places and poses, the same camera, the same narrow dark wooden frame on the "
               "wall in the same place. Only one change: inside the frame the canvas is now empty - a bare, slightly warm "
               "off-white canvas with no image at all. The soft vermilion and yellow glow that the painting threw stays exactly "
               "as it is on the concrete floor, on the wall around the frame and on the two people, as if the colour remained "
               "in the room after the painting left. Photoreal, 35mm film grain."),
    'note': '11 Oct 2026 Arearea final shot: kA1 with an empty canvas, for the drain dissolve'}
json.dump(plan, open('plan.json', 'w'), indent=1, ensure_ascii=False)
print('added kA1d')
