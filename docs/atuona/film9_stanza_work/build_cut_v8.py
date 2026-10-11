"""11 Oct 2026: the v8 cut of Atuona film #9 = the published v7 with a THINNER stanza type. Elena: "the movie is fine. i like it.
but you need to change the format and style of stanzas text. format should be thinner, more underground aesthetic looking. now
it is cartoonish. design the right format and style." Four thin faces were rendered on the same three shots (bright frost,
dark water, red skin); chosen: Geologica ExtraLight (the atuona.xyz title family), 60 px, wide tracking that opens 3 -> 5,
bone white #E9E4DC, no hard outline (a soft dark shade behind instead), a hairline crimson fringe 2 px right. The words still
arrive with the narrator and drift. Run from the repo root: python docs/atuona/film9_stanza_work/build_cut_v8.py"""
import json
W = 'docs/atuona/film9_stanza_work'
cut = json.load(open(f'{W}/cut_v7_2026-10-10.json', encoding='utf-8'))
cut['text_design'] = {
    'font': 'Geologica ExtraLight', 'size': 60, 'cols': 44, 'fsp0': 3, 'fsp1': 5,
    'colour': '&H00DCE4E9', 'outline': 0, 'outlineColour': '&H00000000', 'rise': 18, 'drift': 10, 'wordFade': 520,
    'shade': {'colour': '&H00000000', 'alpha': '&H58&', 'blur': 9, 'bord': 3},
    'fringe': {'colour': '&H002F14C0', 'alpha': '&H66&', 'dx': 2, 'dy': 0, 'blur': 0.7},
    'cardHeaderFont': 'Geologica-200.ttf',
}
cut['_note'] = "v8, 11 Oct 2026: v7 with a thin underground stanza type (text_design); see build_cut_v8.py"
json.dump(cut, open(f'{W}/cut_v8_2026-10-11.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print('cut_v8 written')
