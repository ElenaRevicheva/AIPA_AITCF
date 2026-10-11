"""11 Oct 2026, Arearea v4 (Elena: "we need absolutely different sexy seductive shot with bodies moving but in Arearea atmosphere
with latest trendy lingerie"). Not seated any more: two women dancing close in an underground space lit only by Arearea's flat
colours (vermilion, chrome yellow, emerald) falling on bodies, floor and air; the idol a red silhouette far behind; the red dog
only as a drifting red-orange haze. Kira: sheer black mesh bodysuit with a satin corset belt; Mila: ivory satin corset bustier set.
Seductive, implied, never explicit. Frame on Seedream v5 Pro edit (it accepted v3; GPT Flare and Nano 2.1 refused that brief),
motion on Kling O3 Pro (Venice balance $2.21 = one 10 s attempt). Refs: kS3 (the people and the night), kira, mila."""
import json, shutil, time
shutil.copy('plan.json', f'plan.json.bak-arearea-v4-{time.strftime("%Y%m%d-%H%M%S")}')
plan = json.load(open('plan.json'))
plan['images']['kD1'] = {
    'engine': 'venice', 'vmodel': 'seedream-v5-pro-edit', 'refs': ['kS3', 'kira', 'mila'], 'aspect': '16:9', 'look': False,
    'prompt': (
        "Photoreal 35mm film still, full-body medium-wide shot, caught mid-movement. An underground night space with no walls you "
        "can see, lit only by Gauguin's Arearea colours: flat planes of vermilion, chrome yellow and deep emerald light falling "
        "across the bodies, the wet floor and the haze, like the painting projected onto the dark; far behind, a tall carved idol "
        "as a red-lit silhouette; a drifting red-orange haze low over the floor. Two women dance close together, hips touching, "
        "slow and seductive, both barefoot on the wet coloured floor. Kira (image 2: about 34, true black long wavy hair, never "
        "blue, wet and swinging with the turn; pale skin glistening; grey-green eyes; a faint healed scar through the left eyebrow) "
        "in a sheer black mesh bodysuit with a black satin corset belt at the waist, mid-turn, one arm raised into her hair, her "
        "eyes catching the lens over her shoulder with parted lips. Mila (image 3: the same pale blonde woman as in image 1, hair "
        "slicked back) in an ivory satin corset bustier with matching high-cut briefs, her hands at Kira's waist, her body leaning "
        "into the turn, eyes half closed. Motion blur on the swinging hair and the hands, sharp faces. Underground luxury fashion "
        "film in the tradition of Helmut Newton, sensual and intimate, never explicit. Real skin, sweat and water; heavy film grain; "
        "crushed blacks; no text."),
    'note': '11 Oct 2026 Arearea v4: the dance, latest lingerie, bodies moving'}
plan['shots']['vkD1'] = {'start': 'kD1', 'engine': 'venice', 'duration': 10,
    'motion': ("Continuous slow sensual dance, the bodies always moving: Kira finishes her turn and rolls her body slowly toward "
               "the camera, her wet hair swinging, her hand sliding from her hair down her neck; Mila follows her, hands on her waist, "
               "both swaying their hips together to a slow deep beat; they turn half around each other, Kira's eyes find the lens "
               "again, her lips part, a slow knowing smile. The coloured light planes - vermilion, chrome yellow, emerald - slide "
               "slowly across their skin and the wet floor as they move; the red-orange haze drifts; the idol's red light pulses on "
               "the beat. Handheld camera circling slowly with them. Seductive, intimate, never explicit; nobody undresses; no text."),
    'note': '11 Oct 2026 Arearea v4: the dance'}
json.dump(plan, open('plan.json', 'w'), indent=1, ensure_ascii=False)
print('added kD1 + vkD1')
