"""10 Oct 2026: the v5 cut of Atuona film #9 = the v4 FINAL cut with the glitch tears FLOWING. Elena, after v4: "Glitch is good
all over the film. But can you make it not just on one place on the screen but flowing from place to place on each shot?"
-> every moving shot gets glitchy: 'flow' (compile: two tears per burst at a new height each burst, drifting up/down).
Nothing else changes: same shots, lengths, music C. Run from the repo root: python docs/atuona/film9_stanza_work/build_cut_v5.py
"""
import json
W = 'docs/atuona/film9_stanza_work'
cut = json.load(open(f'{W}/cut_v4_2026-10-10.json', encoding='utf-8'))
for it in cut['items']:
    if 'clip' in it:
        it['glitchy'] = 'flow'
cut['_note'] = "v5, 10 Oct 2026: v4 FINAL with flowing glitch tears (glitchy: 'flow'); see build_cut_v5.py"
out = f'{W}/cut_v5_2026-10-10.json'
json.dump(cut, open(out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(sum(1 for i in cut['items'] if i.get('glitchy') == 'flow'), "shots with glitchy='flow' ->", out)
