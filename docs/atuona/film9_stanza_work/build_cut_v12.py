"""11 Oct 2026: the v12 cut of Atuona film #9 = the published v10 with two edits from Elena:
  "there is absolutely no pause between each stanza reading - make a little pause - but do not touch video length"
     -> every shot keeps its v10 length (pinned as `edit`, built with FILM9_TAIL=0); each line's start (`lead`) comes from
        plan_v12_pauses.json, so at least 1.0 s of silence comes before every next line; three lines play a little faster
        (render_v12/vo, atempo, pitch kept: 2 x1.03, 13 x1.11, 10b x1.14). The typing follows the same timing.
  "except this one with Mila and sand - make it not very long like it was but not so short as it is now because blue sand
   flowing should be visible as a process ... make it glitchy" -> M4 is a moving shot again (the whole vM4 clip at x1.2 = 6 s,
     flowing glitch, no line), instead of the 0.9 s flash.
Run from the repo root: python docs/atuona/film9_stanza_work/build_cut_v12.py"""
import json
W = 'docs/atuona/film9_stanza_work'
cut = json.load(open(f'{W}/cut_v10_2026-10-11.json', encoding='utf-8'))
P = json.load(open(f'{W}/plan_v12_pauses.json', encoding='utf-8'))
items = []
for it in cut['items']:
    if it.get('sid') == 'g_M4':
        items.append({'sid': 'M4', 'clip': 'vM4__venice-kling-o3-pro.mp4', 'edit': P['M4_DUR'], 'planned_edit': P['M4_DUR'],
                      'slow': 1.2, 'glitchy': 'flow', 'qc': 'Elena 11 Oct: Mila and the blue sand as a moving shot again (was a 0.9 s flash)'})
        continue
    if 'clip' in it:
        sp = P['shots'][it['sid']]
        it = dict(it, edit=sp['edit'], lead=sp['lead'])
        if sp['f'] > 1.001:
            it['voice_speed'] = sp['f']
    items.append(it)
cut['items'] = items
cut['_note'] = "v12, 11 Oct 2026: v10 + a pause before every line (lengths pinned, leads planned) + M4 back as a moving shot; see build_cut_v12.py"
json.dump(cut, open(f'{W}/cut_v12_2026-10-11.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
changed = [i['sid'] for i in items if 'clip' in i and (abs(i.get('lead', 0.5) - 0.5) > 1e-3 or i.get('voice_speed') or i['sid'] == 'M4')]
print('cut_v12 written; shots to re-render:', ','.join(changed))
open(f'{W}/v12_reseg.txt', 'w').write(','.join(changed))
