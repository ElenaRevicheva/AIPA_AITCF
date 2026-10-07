"""Film #9 erotic glitch stills (7 Oct 2026, Elena).
Approved: G2 G3 G5 G6 G7 G8 + k11 redesign (G1, G4 rejected: Kira is a lesbian — no sex scene with Ule).
Register: Crimson Escape glitches but much more sexy; never frontal nudity, never a sex act shown.
Engine: Venice adult lane — qwen-edit-uncensored, safe_mode off, with the cast reference images.
EVERY still carries one quiet surreal detail "from another reality" (Elena): a real world shot with total realism
where one impossible thing is treated as normal.
Run on Oracle from ~/atuona-film9: python3 film9_glitch_plan_2026-10-07.py  (adds the entries to plan.json)."""
import json

p = json.load(open('plan.json'))
# qwen-edit-uncensored caps the prompt at 1500 chars, so the long real_look_2 does not fit: short realism line instead
look = ('Unretouched photograph on 35mm film, real skin with pores and sweat, natural asymmetry, practical light only, '
        'film grain; not CGI, not a painting, no airbrushing.')
K = ("the woman from the first reference image (same face, grey-green eyes, glossy true-black wavy hair, never blue, "
     "pale skin, full lips, a faint pale healed hairline scar through her left eyebrow), about 34")
U = ("the man from the second reference image (same face, tanned, ash-blond hair tied back loosely, golden stubble, "
     "pale blue eyes, about 47, devilishly handsome)")
SURREAL = (" One quiet impossible detail, photographed as if it were completely normal, nobody in the image reacts to it: ")
G = {
    'G2': (['kira', 'ule'],
           f"Night, extreme close-up, crimson lamplight and sweat. {U} has his open mouth on the side of her throat; {K} "
           "throws her head back, eyes closed, lips parted, breathless; her fingernails press into his bare shoulder. Skin "
           "glistening, strands of black hair stuck to her neck. Intensely sensual, adult, cinematic; faces and shoulders only."
           + SURREAL + "on the wall behind them their two shadows stand far apart, not touching, as if the shadows refuse."),
    'G3': (['kira_jungle_final', 'ule'],
           f"Night, a lantern-lit room in a storm, seen from behind. The sheer jungle-print chiffon dress from the first "
           f"reference image slides off both of her shoulders down to her waist, baring her whole back; {U}, standing behind "
           f"her, holds the zip at the base of her spine with two fingers, his breath on her neck. Her face in profile over her "
           f"shoulder: {K}. Seen only from behind, her back bare, nothing frontal. Charged, slow, adult."
           + SURREAL + "one printed palm leaf has left the chiffon and grows as a real living green leaf along her bare spine."),
    'G5': (['kira', 'ule'],
           f"Night rain, extreme close-up of two mouths: {U} holds her full lower lip gently between his teeth; {K}, eyes "
           "half-closed, rain running down both faces, lips wet and swollen. Hunger, not violence. Shallow focus, crimson and "
           "blue rim light." + SURREAL + "around their faces the raindrops hang motionless in the air, frozen, while the rain "
           "on their skin still runs."),
    'G6': (['kira'],
           f"Macro, night, candlelight: a necklace of white gold and diamonds with a single emerald drop lies on the sweat-wet "
           f"collarbone of {K}, rising and falling with her breath; a man's tanned thumb rests on the tiny clasp at the nape of "
           "her neck. Glistening skin, beads of sweat, the emerald catching the light. Throat and collarbones only."
           + SURREAL + "inside the emerald, tiny and sharp, a stormy sea is moving with a white wave breaking."),
    'G7': (['kira', 'ule'],
           f"Night, black sea under a low moon: {K} rises out of the water seen from behind, bare back and shoulders, soaked "
           f"black hair streaming down her spine; {U} stands in the water behind her, his hands on her waist at the waterline, "
           "his mouth near her ear. Water to her waist. Moonlit skin, droplets, desire."
           + SURREAL + "the water around them reflects a bright midday sky with white clouds, though above them it is deep night."),
    'G8': (['kira', 'ule'],
           f"Night, a tarnished old mirror under a crimson lamp. {K} in a black silk slip, one strap fallen off her shoulder; "
           f"{U} stands behind her, his mouth on her bare shoulder, his hand on her waist. Sweat, silk, shadow. Adult, "
           "sensual, cinematic." + SURREAL + "in the mirror she is alone: the reflection shows only her, the strap fallen, "
           "her eyes knowing; the man is not in the mirror at all."),
    'k11g': (['kira'],
             f"A dim tropical bedroom, a tall free-standing mirror with tarnished silver edges, crimson lamplight. {K} stands "
             "still in front of the mirror in a black silk slip, seen from behind at the shoulders. In the mirror her "
             "reflection, the same woman, slowly slides one thin strap off her shoulder with two fingers and looks back at "
             "her with a knowing, provocative half-smile, lips parted. Only the reflection moves. Bare shoulders, silk, "
             "chiaroscuro. Adult, sensual, not explicit." + SURREAL + "the room inside the mirror is in bright tropical "
             "daylight, while the real room is night."),
}
for k, (refs, prompt) in G.items():
    assert len(prompt) + len(look) + 1 <= 1500, (k, len(prompt) + len(look))
    p['images'][k] = {'engine': 'venice', 'vmodel': 'qwen-edit-uncensored', 'refs': refs, 'aspect': '16:9',
                      'prompt': prompt, 'look': look,
                      'note': '7 Oct Elena: erotic glitch still, Crimson Escape register but much more sexy, one surreal '
                              'detail from another reality; G1/G4 rejected (Kira is a lesbian); Venice adult lane'}
json.dump(p, open('plan.json', 'w'), indent=1, ensure_ascii=False)
print('plan ok:', ', '.join(G))
