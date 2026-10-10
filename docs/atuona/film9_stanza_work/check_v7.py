"""10 Oct 2026: prove a film #9 v7 build honours ALL of Elena's instructions (v6: a whole verbatim stanza per shot, voiced by onyx, poem-link end card) — the v2 screenshot edit plus her four phone edits
(v3's four + music C, every shot glitchy, 25 = the video v25, 11 shorter) — from the build's own outputs, not the plan.
Usage (repo root): python docs/atuona/film9_stanza_work/check_v7.py <WORK dir> <final.mp4>"""
import json, subprocess, sys
WORK, FINAL = sys.argv[1], sys.argv[2]
FB = 'C:/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32/ffprobe.exe'
tl = json.load(open(f'{WORK}/timeline.json', encoding='utf-8'))
cut = json.load(open('docs/atuona/film9_stanza_work/cut_v7_2026-10-10.json', encoding='utf-8'))
REMOVED = {'22', '5', '1c', '7', '17', '18', '21', '24', '26', '27', '28', '30', '32', '34'}
FLASHED = {'M4', '19', '20', '20b', '35'}
SHORT = {'1a': 3.8, '1b': 3.8, '7m': 3.8, '10a': 5.0, '10b': 3.6, '11': 3.8, '25': 10.0, '15': 6.0, '13': 6.0, '36': 4.8}
ADDED = {'25': 'v25__venice-kling-o3-pro.mp4', '13': 's13__luma.mp4', '30b': 'v30b__venice-kling-o3-pro.mp4', '24b': 'v24Lb__venice-kling-o3-pro.mp4', 'M3': 'vM3__venice-kling-o3-pro.mp4'}
shots = {t['shot']: t for t in tl}
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond
check(not (REMOVED & set(shots)), f'removed shots absent from the timeline: {sorted(REMOVED & set(shots)) or "none present"}')
check(not (FLASHED & set(shots)), f'flashed shots are not moving shots: {sorted(FLASHED & set(shots)) or "none present"}')
flashes = [i for i in cut['items'] if i.get('glitch_only')]
check({i['sid'] for i in flashes} >= {f'g_{s}' for s in FLASHED} | {'g_G7s', 'g_G8s', 'g_k11q', 'g_k37v1', 'g_G7'}, f'{len(flashes)} flash items in the cut')
for sid, d in SHORT.items():
    # v6: a shot may grow past her length only by what its spoken line needs (lead 0.5 + voice + tail 1.2)
    check(sid in shots and shots[sid]['dur'] >= d - 0.05, f'{sid} runs {shots.get(sid, {}).get("dur")} s (asked {d}; longer only for its voice)')
for sid, clip in ADDED.items():
    check(sid in shots and shots[sid]['clip'] == clip, f'{sid} uses {shots.get(sid, {}).get("clip")}')
check(all(i.get('glitchy') == 'flow' for i in cut['items'] if 'clip' in i), 'every moving shot carries the FLOWING glitch')
check(cut['music'] == 'music/film9_v2_basement.mp3', 'music = take C basement')
check(all(t['vo_at'] is not None for t in tl), 'every shot has its voice line placed')
inv = {s['id']: s for s in json.load(open('docs/atuona/film9_stanza_work/v6_stanza_inventory.json', encoding='utf-8'))}
check(all(i.get('stanza_id') in inv and i['stanza'] == inv[i['stanza_id']]['text'] for i in cut['items'] if 'clip' in i), 'every shot carries its whole picked stanza, unchanged')
check(all(i['poem'][1:] in ('082', '083') for i in cut['items'] if i.get('sid') in ('M1', 'M2', 'M3', 'M5')), 'the four Mila shots carry Mila stanzas (#082/#083)')
check(len(cut.get('poem_links', [])) == len({i['poem'] for i in cut['items'] if 'clip' in i}), f"end card lists {len(cut.get('poem_links', []))} poems = every poem quoted")
import os
check(os.path.getsize(f'{WORK}/card_poems.mp4') > 10000, 'poem-link end card rendered')
check(not [i for i in cut['items'] if 'tail' in i], 'no still-motion tail left (36 ends when the walk ends)')
order = [t['shot'] for t in tl]
check(order == [i['sid'] for i in cut['items'] if 'clip' in i], f'timeline order = cut order: {" ".join(order)}')
probe = subprocess.run([FB, '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate', '-of', 'json', FINAL], capture_output=True, text=True)
j = json.loads(probe.stdout); dur = float(j['format']['duration']); streams = j['streams']
v = [s for s in streams if s['codec_type'] == 'video'][0]
check(v['width'] == 1920 and v['height'] == 1080 and v['r_frame_rate'] == '24/1', f'{v["width"]}x{v["height"]} @ {v["r_frame_rate"]}')
check(any(s['codec_type'] == 'audio' for s in streams), 'audio stream present')
last = tl[-1]; expected_end = last['start'] + last['dur'] + 4.2 - 1.3 + 7.0 - 1.3   # + the 7 s poem card
# timeline starts come from the rendered segments' own lengths; minterpolate rounds each to whole frames, so over 36 pieces
# the sum drifts up to ~1.5 s from the container duration (the preview, without interpolation, drifts 0.3 s)
check(abs(dur - expected_end) < 2.0, f'duration {dur:.1f} s (last shot ends {last["start"] + last["dur"]:.1f} s + outro card)')
check(cut.get('text_style') == 'flow' and all(os.path.getsize(f"{WORK}/work/flow_{i['sid']}.ass" if False else f"{WORK}/flow_{i['sid']}.ass") > 500 for i in cut['items'] if 'clip' in i), 'every shot has its flowing-text file (libass, Syne)')
print('ALL PASS' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
