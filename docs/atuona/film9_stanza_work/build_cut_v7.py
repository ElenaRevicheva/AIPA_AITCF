"""10 Oct 2026: the v7 cut of Atuona film #9 = the v6 cut (her whole stanzas, onyx voice, music C, flowing glitch, poem
links) with the stanzas DESIGNED: Elena "make format of stanzas text bigger and design more like underground aesthetic style -
so that a viewer pays attention not just to a video but to the text as well and the text should flow, not stand still like
being typed on a laptop powershell". -> text_style 'flow' (compile: Syne, 78 px, bone white + crimson chromatic edge, words
arriving with the narrator, slow drift). The poem list stays the last card, right after the ATUONA title card.
Run from the repo root: python docs/atuona/film9_stanza_work/build_cut_v7.py"""
import json
W = 'docs/atuona/film9_stanza_work'
cut = json.load(open(f'{W}/cut_v6_2026-10-10.json', encoding='utf-8'))
cut['text_style'] = 'flow'
cut['_note'] = "v7, 10 Oct 2026: v6 + flowing underground stanza design (text_style 'flow'); see build_cut_v7.py"
json.dump(cut, open(f'{W}/cut_v7_2026-10-10.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print('cut_v7 written: text_style flow,', sum(1 for i in cut['items'] if 'clip' in i), 'shots')
