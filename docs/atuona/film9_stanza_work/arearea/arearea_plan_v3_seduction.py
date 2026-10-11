"""11 Oct 2026, Arearea v3 (Elena on v2: "better - but still not well enough - it should be super seductive - more movement - Kira
face is still steady - we do not need flauta at all - we need something hot, super juicy but underground aesthetic should persist -
more erotic - where is super cool underwear and light dressing"). Same night as kR3 (her pick): the wet-paint vermilion / yellow /
emerald ground, the idol in red light, no sky, the red dog only as a shapeless orange haze. No flute. Two women of Arearea become two
women of the film, seductive, implied, never explicit (film #9 rule: erotic = implied - wet silk, bare shoulders, lace; nothing
explicit). Frames on the two newest reference-edit models: kS1 GPT Image 2.5 Flare, kS2 Nano Banana 2.1. Refs: kR3 (the scene),
kira, mila. Run on Oracle in ~/atuona-film9."""
import json, shutil, time
shutil.copy('plan.json', f'plan.json.bak-arearea-v3-{time.strftime("%Y%m%d-%H%M%S")}')
plan = json.load(open('plan.json'))
PROMPT = (
    "Photoreal 35mm film still in the same night as image 1: the same ground of flat glowing colour like wet oil paint - "
    "vermilion, chrome yellow, deep emerald - shining under one low warm lamp, the same carved idol far behind in red light with "
    "its small kneeling figures, no sky, velvet black above, haze, heavy film grain. Underground luxury fashion editorial in the "
    "tradition of Helmut Newton and Paolo Roversi, seductive and intimate, never explicit. Kira (image 2: about 34, true black long "
    "wavy hair, never blue, wet; pale skin glistening with water; grey-green eyes; a faint healed scar through the left eyebrow) "
    "half-kneels in the centre of the frame, close to the camera, wearing a black lace lingerie set under a sheer crimson silk "
    "robe that has slipped off one shoulder; she looks straight into the lens with parted lips and a slow, hungry, knowing gaze, "
    "one hand pushing her wet hair back. Mila (image 3: a pale blonde model, hair slicked back) kneels close behind her in a white "
    "lace slip, her cheek near Kira's hair, her fingertips resting on Kira's bare shoulder, eyes half closed. A drifting haze of "
    "red-orange light crosses the foreground low over the ground. Real skin, real lace, real silk; no flute, no text.")
for kid, model in [('kS1', 'gpt-image-2-5-flare-edit'), ('kS2', 'nano-banana-2-1-edit')]:
    plan['images'][kid] = {'engine': 'venice', 'vmodel': model, 'refs': ['kR3', 'kira', 'mila'], 'aspect': '16:9', 'look': False,
                           'prompt': PROMPT, 'note': f'11 Oct 2026 Arearea v3 (seductive) on {model}'}
MOTION = ("Slow, sensual, continuous movement; a slow handheld drift toward them. Kira's face is alive: her lips part, she breathes "
          "in, a slow blink, the corner of her mouth lifts into an unfinished smile, she tilts her head and her eyes return to the "
          "lens; her hand slides through her wet hair and down to her neck; the crimson silk robe slips a little further off her "
          "shoulder. Mila leans in, her fingertips trace slowly along Kira's shoulder, her eyes half closed, her breath on Kira's "
          "hair. The wet colour of the ground ripples and bleeds - vermilion, yellow, emerald - under the lamp; a red-orange haze "
          "drifts across the foreground; the idol's red light pulses. Seductive, intimate, never explicit; nobody undresses; no text.")
for kid in ('kS1', 'kS2'):
    plan['shots']['v' + kid] = {'start': kid, 'engine': 'venice', 'duration': 10, 'motion': MOTION,
                                'note': '11 Oct 2026 Arearea v3: seductive, alive, no flute'}
json.dump(plan, open('plan.json', 'w'), indent=1, ensure_ascii=False)
print('added kS1 kS2 + vkS1 vkS2')
