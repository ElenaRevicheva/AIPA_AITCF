r"""11 Oct 2026: the v9 cut of Atuona film #9 = the published v7 with the stanzas TYPED IN A POWERSHELL SESSION.
Elena on the thin v8 preview: "no. it looks generic. it should be like somebody is coding on powershell".
text_design.mode 'terminal' (compile termAss): a dim prompt with a real cmdlet, `PS C:\atuona> Get-Content .\pNNN.txt`
(NNN = the poem the stanza comes from), typed in the first half second; then the stanza typed character by character in
step with the narrator, a crimson block cursor at the typing head that keeps blinking once the stanza is done.
JetBrains Mono (the face the atuona.xyz vault sets its poems in), 46 px, bottom-left; a soft dark shade for legibility.
Run from the repo root: python docs/atuona/film9_stanza_work/build_cut_v9.py"""
import json
W = 'docs/atuona/film9_stanza_work'
cut = json.load(open(f'{W}/cut_v7_2026-10-10.json', encoding='utf-8'))
cut['text_design'] = {
    'mode': 'terminal', 'font': 'JetBrains Mono', 'size': 46, 'cols': 50, 'x': 110, 'y': 1012,
    'colour': '&H00E6E6E6', 'outColour': '&HE6E6E6&', 'promptColour': '&H8A8A8A&', 'cmdColour': '&H4A3AD8&',
    'cursorColour': '&H2F14C0&', 'cursorChar': '\u2588', 'shade': {'blur': 8, 'bord': 4}, 'shadeAlpha': '&H60&',
    'cardHeaderFont': 'JetBrainsMono-400.ttf',
}
cut['_note'] = "v9, 11 Oct 2026: v7 with the stanzas typed in a PowerShell session (text_design.mode terminal); see build_cut_v9.py"
json.dump(cut, open(f'{W}/cut_v9_2026-10-11.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print('cut_v9 written')
