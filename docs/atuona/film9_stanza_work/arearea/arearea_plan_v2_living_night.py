"""11 Oct 2026, Arearea v2 (Elena: the gallery-wall version "is ugly ... make something absolutely underground aesthetic,
impressionism - surrealism using latest models wired in venice"). Arearea (1892) RESTAGED as a living night in the film's world,
from the painting's facts and her fragment #087 ("Paints not what he saw - what he assembled." "Color matters more than truth."
"Two women - in the foreground. No gesture. No address. Behind - a flute. Further still - an idol." "a red dog. Fact: dogs aren't
red. Fact: it has no shadow."). Bake-off of the newest Venice reference-edit models on ONE brief: kR1 Nano Banana 2.1,
kR2 Flux 3, kR3 GPT Image 2.5 Flare. Refs: kira, mila (cast). No painting ref (its bare-breasted flute player made Kling refuse).
The red dog is NOT drawn: in the motion it is a shapeless red-orange glow with no shadow. Run on Oracle in ~/atuona-film9."""
import json, shutil, time
shutil.copy('plan.json', f'plan.json.bak-arearea-v2-{time.strftime("%Y%m%d-%H%M%S")}')
plan = json.load(open('plan.json'))
PROMPT = (
    "Photoreal 35mm film still, night, underground art-house cinema. Paul Gauguin's Arearea (1892) restaged as a living night "
    "with real people. Kira (image 1: about 34, true black long wavy hair, never blue; pale skin; grey-green eyes; a faint healed "
    "scar through the left eyebrow) sits on the ground with her legs folded under a white one-shoulder linen dress, hands resting "
    "in her lap, looking straight into the lens: no gesture, no smile. Beside her and a little behind, Mila (image 2: a pale "
    "blonde model, hair pulled back) sits with her head lowered, wrapped to the shoulders in an indigo pareu, playing a short "
    "bamboo flute. Behind them a smooth blue-grey tree trunk rises out of frame, a few white blossoms on it. The ground beneath "
    "them is not sand: flat planes of impossible colour - vermilion, chrome yellow, deep emerald - glowing from within like wet "
    "oil paint, their edges bleeding into each other like impressionist brushstrokes. No sky: above the horizon only velvet "
    "black. Far behind, small and soft, a carved wooden idol lit by a single red light, three tiny kneeling figures before it. "
    "One low warm lamp from the left; everything else falls into deep shadow; haze in the air, heavy film grain, crushed blacks. "
    "A colour that does not exist in nature, carried by light on real skin. Not a painting, not an illustration: real people.")
for kid, model in [('kR1', 'nano-banana-2-1-edit'), ('kR2', 'flux-3-image-edit'), ('kR3', 'gpt-image-2-5-flare-edit')]:
    plan['images'][kid] = {'engine': 'venice', 'vmodel': model, 'refs': ['kira', 'mila'], 'aspect': '16:9', 'look': False,
                           'prompt': PROMPT, 'note': f'11 Oct 2026 Arearea v2 bake-off on {model}'}
MOTION = ("Locked-off, an imperceptible slow push-in. Impressionist breathing: the vermilion, chrome yellow and emerald planes "
          "of the ground slowly flow and bleed into each other like wet oil under the light. A low red-orange glow with no shape "
          "and no shadow slides slowly across the foreground from left to right, close to the ground, and is gone. Mila's fingers "
          "move on the flute, her eyes stay down. Kira does not move and does not blink, she looks into the lens. Haze drifts "
          "through the lamp light; far away the idol's red light pulses once. Nothing else appears; no text.")
for kid in ('kR1', 'kR2', 'kR3'):
    plan['shots']['v' + kid] = {'start': kid, 'engine': 'venice', 'duration': 10, 'motion': MOTION,
                                'note': '11 Oct 2026 Arearea v2: the red dog as colour only'}
json.dump(plan, open('plan.json', 'w'), indent=1, ensure_ascii=False)
print('added kR1 kR2 kR3 + vkR1 vkR2 vkR3')
