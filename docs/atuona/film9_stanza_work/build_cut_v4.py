"""10 Oct 2026: the v4 (final) cut of Atuona film #9 = the v3 cut + Elena's last word, from her phone (screenshots of v3 at
0:41 "Come on, ease the straps down..." = shot 11, and 1:48 "Salt left white trails..." = shot 25):
  "Music C."                                                -> music/film9_v2_basement.mp3 (take C, BASEMENT)
  "make every shot in the video glitchy - like ... the back and finger shot"
                                                            -> `glitchy` on EVERY moving shot (the 10 flashes already are)
  "Back and finger shot should not be steady image glitching, search for a video - it was previously generated"
                                                            -> 25 = v25__venice-kling-o3-pro.mp4 (her 9 Oct approved video, md5 aad3a7d7),
                                                               the whole 10 s clip = its initial 10 s; the still-motion sm_k25m is out
  "Shot with Kira in front of the mirror should be shorter" -> 11: 5.0 s -> 3.8 s (v2's "much shorter")
Run from the repo root: python docs/atuona/film9_stanza_work/build_cut_v4.py
"""
import json

W = 'docs/atuona/film9_stanza_work'
cut = json.load(open(f'{W}/cut_v3_2026-10-10.json', encoding='utf-8'))
for it in cut['items']:
    if 'clip' not in it:
        continue
    it['glitchy'] = True
    if it['sid'] == '25':
        it.update({'clip': 'v25__venice-kling-o3-pro.mp4', 'slow': 1.0, 'edit': 10.0,
                   'qc': 'Elena 10 Oct: the video take (approved 9 Oct) replaces the still-motion; whole clip'})
    elif it['sid'] == '11':
        it['edit'] = 3.8
cut['music'] = 'music/film9_v2_basement.mp3'
cut['_note'] = "v4 FINAL, 10 Oct 2026: v3 + music C, every shot glitchy, 25 = video v25, 11 shorter; see build_cut_v4.py"
out = f'{W}/cut_v4_2026-10-10.json'
json.dump(cut, open(out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
shots = [i for i in cut['items'] if 'clip' in i]
print(f"{len(shots)} shots, glitchy {sum(1 for i in shots if i.get('glitchy'))}; 11 = {[i['edit'] for i in shots if i['sid']=='11'][0]} s;",
      f"25 = {[i['clip'] for i in shots if i['sid']=='25'][0]}; music {cut['music']} -> {out}")
