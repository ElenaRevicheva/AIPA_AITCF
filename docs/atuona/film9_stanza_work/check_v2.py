"""10 Oct 2026: prove a film #9 v2 build honours Elena's instructions — from the build's own outputs, not from the plan.
Usage (repo root): python docs/atuona/film9_stanza_work/check_v2.py <WORK dir> <final.mp4>"""
import json, subprocess, sys
WORK, FINAL = sys.argv[1], sys.argv[2]
FB = 'C:/Users/kirav/AppData/Local/Python/pythoncore-3.14-64/Lib/site-packages/static_ffmpeg/bin/win32/ffprobe.exe'
tl = json.load(open(f'{WORK}/timeline.json', encoding='utf-8'))
cut = json.load(open('docs/atuona/film9_stanza_work/cut_v2_2026-10-10.json', encoding='utf-8'))
REMOVED = {'5', '1c', '7', '17', '18', '21', '24', '26', '27', '28', '30', '32', '34'}
FLASHED = {'M4', '19', '20', '20b', '35'}
SHORT = {'1a': 3.8, '1b': 3.8, '7m': 3.8, '22': 3.8, '10a': 5.0, '10b': 3.6, '11': 5.0, '25': 5.0, '36': 4.8}
ADDED = {'30b': 'v30b__venice-kling-o3-pro.mp4', '24b': 'v24Lb__venice-kling-o3-pro.mp4', 'M3': 'vM3__venice-kling-o3-pro.mp4'}
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
    check(sid in shots and abs(shots[sid]['dur'] - d) < 0.05, f'{sid} runs {shots.get(sid, {}).get("dur")} s (asked {d})')
for sid, clip in ADDED.items():
    check(sid in shots and shots[sid]['clip'] == clip, f'{sid} uses {shots.get(sid, {}).get("clip")}')
check(all(t['vo_at'] is None for t in tl), 'no voice line placed')
check(not [i for i in cut['items'] if 'tail' in i], 'no still-motion tail left (36 ends when the walk ends)')
order = [t['shot'] for t in tl]
check(order == [i['sid'] for i in cut['items'] if 'clip' in i], f'timeline order = cut order: {" ".join(order)}')
probe = subprocess.run([FB, '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate', '-of', 'json', FINAL], capture_output=True, text=True)
j = json.loads(probe.stdout); dur = float(j['format']['duration']); streams = j['streams']
v = [s for s in streams if s['codec_type'] == 'video'][0]
check(v['width'] == 1920 and v['height'] == 1080 and v['r_frame_rate'] == '24/1', f'{v["width"]}x{v["height"]} @ {v["r_frame_rate"]}')
check(any(s['codec_type'] == 'audio' for s in streams), 'audio stream present')
last = tl[-1]; expected_end = last['start'] + last['dur'] + 4.2 - 1.3
check(abs(dur - expected_end) < 1.0, f'duration {dur:.1f} s (last shot ends {last["start"] + last["dur"]:.1f} s + outro card)')
print('ALL PASS' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
