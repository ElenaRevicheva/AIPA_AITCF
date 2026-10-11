"""11 Oct 2026: the v15 cut of film #9 = v14 with the film RENAMED (Elena: "name the movie Arerea, not Atuona" -> Arearea, the
painting's spelling). Only the opening title card changes (CUT.title, also the published file's slug); every shot, stanza, line and
timing is v14's. The closing card keeps ATUONA as the gallery's sign-off. Run from the repo root."""
import json
W = 'docs/atuona/film9_stanza_work'
cut = json.load(open(f'{W}/cut_v14_2026-10-11.json', encoding='utf-8'))
cut['title'] = 'AREAREA'
cut['_note'] = "v15, 11 Oct 2026: v14 renamed AREAREA (opening card + file slug); see build_cut_v15.py"
json.dump(cut, open(f'{W}/cut_v15_2026-10-11.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print('cut_v15 written: title', cut['title'])
