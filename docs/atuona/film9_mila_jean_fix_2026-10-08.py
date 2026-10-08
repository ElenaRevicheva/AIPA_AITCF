"""8 Oct 2026: surreal-detail fixes on the Seedream Mila/Jean stills, as non-explicit nano-banana edits.
M1: Seedream kept a human shadow -> add the bronze-sculpture shadow (her line "legs like Giacometti sculptures", #082).
M5: Seedream seated Mila on the sofa -> empty sofa, Mila only as a reflection in the window ("exists only as reflection of
someone else's desire", #083). Run on Oracle from ~/atuona-film9."""
import json

p = json.load(open('plan.json'))
p['images']['M1f'] = {
    'engine': 'venice', 'vmodel': 'nano-banana-pro-edit', 'refs': ['M1s'], 'aspect': '16:9', 'look': False,
    'prompt': ('Edit this photograph. Change only one thing: the shadow of the tall blonde woman on the wooden planks becomes '
               'the long, thread-thin, rough, knobbly shadow of a bronze walking-figure sculpture, rigid and elongated, '
               'unmistakably a sculpture, while the man beside her keeps his normal human shadow. Everything else stays exactly '
               'the same: people, faces, clothes, seaplane, copper water, storm sky, light, framing.'),
    'note': '8 Oct: M1 surreal fix (bronze-sculpture shadow) on the Seedream still'}
p['images']['M5f'] = {
    'engine': 'venice', 'vmodel': 'nano-banana-pro-edit', 'refs': ['M5s'], 'aspect': '16:9', 'look': False,
    'prompt': ('Edit this photograph. Remove the blonde woman in white from the room entirely, so the white sofa is empty with '
               'only a slight dent in the cushion. Show her instead only as a faint reflection in the dark window glass, sitting '
               'barefoot in white on the sofa and looking back into the room, as if the glass remembers her. Keep the high-heeled '
               'sandals on the floor, the candle, the dark-haired woman with her shoulder and hair in the foreground, the night '
               'sea and everything else exactly the same.'),
    'note': '8 Oct: M5 surreal fix (empty sofa, Mila only in the window reflection) on the Seedream still'}
json.dump(p, open('plan.json', 'w'), indent=1, ensure_ascii=False)
print('fix entries added')
