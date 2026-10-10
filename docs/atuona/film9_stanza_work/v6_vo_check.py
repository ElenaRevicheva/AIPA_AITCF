"""10 Oct 2026: prove every v6 voice take says her stanza — transcribe each vo/<sid>.mp3 back (OpenAI whisper-1) and compare
words with the cut's stanza. Usage (repo root): FILM9_ENV=<.env> python docs/atuona/film9_stanza_work/v6_vo_check.py <cut.json> <vo dir>"""
import json, os, re, subprocess, sys, difflib
ENV = open(os.environ['FILM9_ENV'], encoding='utf-8').read()
KEY = re.search(r'^OPENAI_API_KEY=(.*)$', ENV, re.M).group(1).strip().strip('"')
cut = json.load(open(sys.argv[1], encoding='utf-8')); VO = sys.argv[2]
words = lambda s: re.sub(r"[^a-z0-9' ]", ' ', s.lower().replace('’', "'").replace('—', ' ')).split()
bad = 0
for it in cut['items']:
    if 'clip' not in it: continue
    heard = None
    for _ in range(4):   # an empty or non-JSON reply is a network hiccup: retry
        r = subprocess.run(['curl', '-s', '-m', '90', 'https://api.openai.com/v1/audio/transcriptions', '-H', f'Authorization: Bearer {KEY}',
                            '-F', 'model=whisper-1', '-F', 'language=en', '-F', f'file=@{VO}/{it["sid"]}.mp3'], capture_output=True, text=True, encoding='utf-8')
        try: heard = json.loads(r.stdout)['text']; break
        except (ValueError, KeyError): pass
    if heard is None: print('NO TRANSCRIPT', it['sid']); bad += 1; continue
    a, b = words(it['stanza']), words(heard)
    ratio = difflib.SequenceMatcher(None, a, b).ratio()
    ok = ratio >= 0.9
    bad += not ok
    print(f"{'PASS' if ok else 'CHECK'} {it['sid']:4} {ratio:.2f}  heard: {heard}")
print('ALL TAKES MATCH' if not bad else f'{bad} take(s) to listen to'); sys.exit(1 if bad else 0)
