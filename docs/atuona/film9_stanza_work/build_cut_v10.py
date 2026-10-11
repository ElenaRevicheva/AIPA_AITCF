r"""11 Oct 2026: the v10 cut of Atuona film #9 = v9 (stanzas typed in a PowerShell session) with Elena's wording: "change
generic poem word - i have fragments in atuona.xyz, not poems". The prompt reads `Get-Content .\fragments\NNN.txt`, the intro
card says "21 fragments", the end card "FRAGMENTS IN THIS FILM". Every number was proven against the live vault
(vault_check.py: each stanza found in its own fragment and no other). Run from the repo root."""
import json
W = 'docs/atuona/film9_stanza_work'
cut = json.load(open(f'{W}/cut_v9_2026-10-11.json', encoding='utf-8'))
cut['text_design']['cmdDir'] = 'fragments'
cut['poem_card_title'] = 'fragments in this film'
cut['moments'] = cut['moments'].replace(' poems  ', ' fragments  ')
cut['_note'] = "v10, 11 Oct 2026: v9 + 'fragments' wording (prompt path, intro and end cards); see build_cut_v10.py"
json.dump(cut, open(f'{W}/cut_v10_2026-10-11.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print('cut_v10:', cut['moments'].replace('\n', ' | '), '/', cut['poem_card_title'])
