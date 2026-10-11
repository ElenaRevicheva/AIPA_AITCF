# ATUONA — film #9 — v10, REPUBLISHED (11 Oct 2026): the stanzas typed like a PowerShell session

Elena, on the v7 text: Syne looked "cartoonish"; a thin Geologica preview (v8) looked "generic"; then: **"it should be like
somebody is coding on powershell"** → "much cooler … but poem number should be actual fitting the true poem content on each
stanza. and change generic poem word - i have fragments in atuona.xyz, not poems" → "make sure while movie will be playing real
numbers of true poems with true content will be typed on the screen".

## The text (compile `text_design.mode: 'terminal'`, `termAss` in `scripts/atuona-film9.mjs`)

- Each shot types into a PowerShell session at the bottom-left: a dim prompt `PS C:\atuona>` and a crimson command
  `Get-Content .\fragments\NNN.txt` (NNN = the fragment the stanza comes from), typed in the first half second; then the stanza,
  character by character in step with the narrator (spaces quicker, a beat after punctuation), a crimson block cursor at the
  typing head that keeps blinking when the stanza is done. JetBrains Mono (the vault's own poem face), 46 px, a soft dark shade.
- Intro card "21 fragments · ATUONA"; end card "FRAGMENTS IN THIS FILM" (JetBrains Mono, Cyrillic titles intact).
- Rejected on the way, kept in git: v8 thin Geologica (`build_cut_v8.py`), v7 Syne flow (`text_design` defaults).

## Proof that the right numbers and words are typed

- `vault_check.py <cut>` — against the **live** atuona.xyz page: every stanza is found inside the fragment its number names
  (23/23; each in that fragment only).
- `typed_check.py <cut> <work>` — opens every burned libass file and checks the final typed state: the prompt names the shot's
  fragment and the typed text is its stanza word for word → `EVERY SHOT TYPES ITS TRUE NUMBER AND TEXT` (23/23).
- `check_v10.py` → ALL PASS (all earlier edits, voice lines, end card).

## Published

- Studio feed, same file name (atomic replace): `atuona-2026-10-10T23-24-23.mp4` = the v10 1080p master, 261.7 MB, 158.5 s,
  ~13.2 Mbit/s, md5 `063386450530f7545fce2aaed28e4198` (laptop = Oracle, HTTP 200, exact length). The v7 master stays on the
  laptop (`render_v7\work\final.mp4`) as the rollback copy.
- Film page https://atuona.xyz/aifilmstudio/atuona/ (atuona `cbb28315` stills removed, `e1754268` fragments wording + new poster):
  "Fragments in the film", "Fragments, direction, edit", the text credit names the PowerShell typing. Live-checked.
- Telegram: the 720p phone copy with the page link (`ok`).
