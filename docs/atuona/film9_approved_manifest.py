"""Film #9 ATUONA — checksum manifest of every asset Elena approved (8 Oct 2026, her ask: "keep in memory all the frames/images
that were approved by me, that nothing is lost"). Run on Oracle ~/atuona-film9; writes APPROVED_MANIFEST_<date>.json.
Re-run any time: a changed md5 on an approved name means the file was overwritten."""
import glob, hashlib, json, os, sys

p = json.load(open('plan.json'))
md5 = lambda f: hashlib.md5(open(f, 'rb').read()).hexdigest()
by_hash = {}
for f in glob.glob('img/*.jpg'):
    by_hash.setdefault(md5(f), []).append(os.path.basename(f)[:-4])


def entry(name, role, extra=None):
    f = 'img/%s.jpg' % name
    h = md5(f)
    e = {'file': f, 'md5': h, 'bytes': os.path.getsize(f), 'role': role,
         'same_bytes_as': sorted(x for x in by_hash[h] if x != name)}
    e.update(extra or {})
    return e


ff = p['final_frames_4m30']
frames = [entry(o['frame'], 'shot ' + o['shot']) for o in ff['order'] if o['frame']]
cast = [entry(v, 'cast: ' + k) for k, v in ff['cast'].items()]
glitch = [entry(v['file'], 'glitch insert %s (approved 7 Oct)' % k, {'surreal': v['surreal']})
          for k, v in p['glitch_approved'].items() if isinstance(v, dict)]
files = lambda pat: [{'file': f, 'md5': md5(f), 'bytes': os.path.getsize(f)} for f in sorted(glob.glob(pat))]
m = {'made': sys.argv[1] if len(sys.argv) > 1 else '2026-10-08', 'dir': 'oracle:~/atuona-film9',
     'rule': 'Elena-approved assets of film #9 ATUONA. Never overwrite, rename or delete; a new version gets a NEW name.',
     'frames': frames, 'cast': cast, 'glitch': glitch,
     'clips': files('clips/v*__venice-kling-o3-*.mp4') + files('stillclips/*.mp4'), 'music': files('music/*.mp3')}
out = 'APPROVED_MANIFEST_%s.json' % m['made']
json.dump(m, open(out, 'w'), indent=1, ensure_ascii=False)
print(out, len(frames), 'frames', len(cast), 'cast', len(glitch), 'glitch', len(m['clips']), 'clips', len(m['music']), 'music')
for e in frames + cast + glitch:
    print(e['role'].ljust(30), e['file'].ljust(22), e['md5'][:10], ','.join(e['same_bytes_as'])[:70])
