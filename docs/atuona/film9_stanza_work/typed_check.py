"""11 Oct 2026: prove what the film TYPES on screen. For every shot of a film #9 cut built with text_design.mode 'terminal', open
the libass file the build burned in (work/flow_<sid>.ass) and check its final state: the prompt reads
Get-Content .\\fragments\\<the shot's true fragment number>.txt and the typed text is the shot's stanza, word for word.
(Elena: "make sure while movie will be playing real numbers of true poems with true content will be typed on the screen".)
Usage (repo root): python docs/atuona/film9_stanza_work/typed_check.py <cut.json> <WORK dir> [<earlier WORK dirs of reused segments> ...]"""
import json, re, sys
BS = chr(92)
cut = json.load(open(sys.argv[1], encoding='utf-8'))
work = sys.argv[2]
words = lambda s: ' '.join(s.split())
bad = 0
for it in cut['items']:
    if 'clip' not in it or not it.get('stanza'):
        continue
    import os
    src = next((w for w in [work] + sys.argv[3:] if os.path.exists(f"{w}/flow_{it['sid']}.ass")), None)   # reused segments: earlier builds
    ass = open(f"{src}/flow_{it['sid']}.ass", encoding='utf-8').read()
    last = [l for l in ass.split('\n') if l.startswith('Dialogue: 1,')][-1].split(',,', 1)[1]
    plain = re.sub(r'\{[^}]*\}', '', last).replace(BS + 'h', ' ').replace(BS + 'N', '\n')
    n = it['poem'][1:]
    ok_num = f'Get-Content .{BS}fragments{BS}{n}.txt' in ass.replace(BS + 'h', ' ')   # spaces are stored as hard spaces
    expect = '\n'.join(it['term_stream']['lines']) if it.get('term_stream') else it['stanza']
    shown = plain.replace(chr(0x2588), '')
    # a streamed fragment scrolls (the last frame shows its last lines); a stanza shows whole
    ok_txt = words(expect).endswith(words(shown.split('\n', 1)[1] if not it.get('term_stream') else shown)) if it.get('term_stream') else words(expect) in words(shown)
    if it.get('term_stream'):
        ok_txt = ok_txt and all(f'{l}' in ass.replace(BS + 'h', ' ') for l in it['term_stream']['lines'])
    bad += not (ok_num and ok_txt)
    print(f"{'OK ' if ok_num and ok_txt else 'BAD'} {it['sid']:4} types fragments{BS}{n}.txt {'+ its stanza' if ok_txt else '- TEXT MISMATCH'}")
print('EVERY SHOT TYPES ITS TRUE NUMBER AND TEXT' if not bad else f'{bad} BAD')
sys.exit(1 if bad else 0)
