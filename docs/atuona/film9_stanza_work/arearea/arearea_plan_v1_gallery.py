"""11 Oct 2026, film #9 final shot (Elena: "search for Arearea history of painting. we need to make one final shot with it -
impressionistic, underground aesthetic, full of true Gauguin sense, fitting my gallery content").
Grounded in: the painting itself (Arearea, 1892, Musee d'Orsay, public domain, Wikimedia Commons), its history (shown at
Durand-Ruel Nov 1893, the red dog mocked, bought back by Gauguin at Drouot 1895), and her fragment #087 "Red Dog" ("the painting
isn't there. It remains in the gap between what is and what the artist decided to see"). The shot answers the film's opening
(1a: the bare spotlit wall, "What about the painting?" she asked. "Paradise?").
Refs on Oracle img/: f1a.jpg (frame of the approved 1a clip), arearea.jpg (the painting, 2048 px), kira.jpg, ule.jpg.
Run on Oracle in ~/atuona-film9 (plan.json backed up first)."""
import json, shutil, time
P = 'plan.json'
shutil.copy(P, f'plan.json.bak-arearea-{time.strftime("%Y%m%d-%H%M%S")}')
plan = json.load(open(P))
PAINTING = ("Paul Gauguin's painting Arearea (image 2), reproduced faithfully and recognisably: two Tahitian women seated on "
            "dark green ground, the one on the left in a blue pareu looking down and playing a small flute, the one on the right "
            "in a white one-shoulder dress looking straight out; a blue-grey tree trunk with white blossoms on the right; a "
            "red-orange dog with its head down in the lower left; far behind, small women before a tall idol; flat bands of "
            "green, vermilion and yellow, no sky. Oil on canvas, visible brushwork, in a narrow dark wooden frame")
ROOM = ("the same empty gallery wall at night as image 1, inside a dark, silent private auction house: an off-white chalky "
        "wall lit by a single museum spotlight, polished dark concrete floor, deep shadows at the edges, faint haze in the beam")
CAST = ("Kira (image 3: about 34, true black long wavy hair, never blue; pale skin; grey-green eyes; a faint healed scar through "
        "the left eyebrow) and Ule (image 4: a man about 47, light ash-blond hair, pale blue eyes)")
SPILL = ("The painting's colours spill off the canvas as light: a soft vermilion and yellow glow pools on the concrete floor and "
         "warms the wall around the frame, as if the painting were breathing colour into the dark room")
plan['images']['kA1'] = {
    'engine': 'venice', 'vmodel': 'seedream-v5-pro-edit', 'refs': ['f1a', 'arearea', 'kira', 'ule'], 'aspect': '16:9',
    'prompt': (f"Wide shot, {ROOM}. On that wall now hangs {PAINTING}, alone, centred under the spotlight. {SPILL}. "
               f"{CAST} stand far apart on either side of the painting, small in the frame, both facing it, as the two figures "
               "stand in image 1. Nobody touches the painting. Stillness, reverence, an auction house after closing."),
    'note': '11 Oct 2026 Arearea final shot, A: the 1a composition answered — the painting on the wall, the two apart'}
plan['images']['kA2'] = {
    'engine': 'venice', 'vmodel': 'seedream-v5-pro-edit', 'refs': ['f1a', 'arearea', 'kira'], 'aspect': '16:9',
    'prompt': (f"Medium shot from behind and slightly to the left of Kira (image 3: true black long wavy hair, never blue; "
               f"bare shoulders), who stands alone close to the wall of image 1 at night, looking at {PAINTING}, which hangs "
               f"under the single museum spotlight and fills the right half of the frame. {SPILL}; the vermilion and yellow "
               "light falls across her bare shoulder and hair. Dark concrete, haze in the beam, deep shadows."),
    'note': '11 Oct 2026 Arearea final shot, B: Kira alone before the painting'}
plan['images']['kA3'] = {
    'engine': 'venice', 'vmodel': 'seedream-v5-pro-edit', 'refs': ['f1a', 'arearea'], 'aspect': '16:9',
    'prompt': (f"Wide shot, {ROOM}, no people. On that wall hangs {PAINTING}, alone, under the spotlight. {SPILL}; the "
               "coloured light reaches far across the empty floor toward the camera. Silence, after closing."),
    'note': '11 Oct 2026 Arearea final shot, C: the room alone (a plate)'}
MOTION = ("Locked-off, an imperceptible slow push-in toward the painting. Haze drifts slowly through the spotlight beam. The "
          "painting's flat colours breathe: the vermilion, yellow and green planes slowly brighten and dim like slow breathing, "
          "their coloured light washing over the floor{who}. Then, very slowly, the image drains out of the canvas until only a "
          "bare spotlit wall remains inside the frame, while the vermilion and yellow light it gave stays glowing on the "
          "floor{who2} a moment longer before it fades. {still}Nothing appears, nothing is added; no text.")
for sid, img, who, who2, still in [('vA1', 'kA1', ' and the two still figures', ' and on them', 'The two figures never move, never turn, never speak. '),
                                   ('vA2', 'kA2', ' and Kira', ' and on her shoulder', 'Kira stays still, only her breath moves. '),
                                   ('vA3', 'kA3', '', '', '')]:
    plan['shots'][sid] = {'start': img, 'engine': 'venice', 'duration': 10,
                          'motion': MOTION.format(who=who, who2=who2, still=still),
                          'note': '11 Oct 2026 Arearea final shot (fragment #087): the painting is there, then it is not'}
json.dump(plan, open(P, 'w'), indent=1, ensure_ascii=False)
print('added kA1 kA2 kA3 + vA1 vA2 vA3')
