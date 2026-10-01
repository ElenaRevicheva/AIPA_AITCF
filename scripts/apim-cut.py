# /api merged film (1 Oct 2026) - ONE film from the v13 + v19 /api promos + the yacht film's real screens. Runs on Oracle.
# Elena: shots from both films; QR + yacht screenshots; music NOT v19's (Content ID) -> a Content-ID-free 2026 deep-house track;
# voice = the old films' (OpenAI tts-1 / onyx / 0.9, apim_vo.py); Spanish captions + yacht type; the heart = the 34 checks
# explained for a business owner, shown on a REAL guided audit of atuona.xyz (rec/S4_audit_groups.mp4, rec_groups.mjs).
# Same clock as the yacht cut: decoded voice lengths + pauses, one frame counter (picture == voice to the frame).
import json, os, subprocess

B = os.path.expanduser("~/aigo-promo"); A = f"{B}/apim"; AS = f"{A}/assets"; VO = f"{A}/vo"
V13, V19 = os.path.expanduser("~/aideazz-api-film/clips"), os.path.expanduser("~/aideazz-api-film-v19/shots")
W, H, FPS = 1920, 1080, 24
QR = f"{B}/img/brand_qr.png"
REC_CHAT = f"{B}/captures/elena-phone-20260930-take3/S1_chatgpt_recording.mp4"; REC_AUD = f"{B}/rec/S4_audit_groups.mp4"
OUTD = f"{A}/cut1"; SEG = f"{OUTD}/seg"; os.makedirs(SEG, exist_ok=True)
ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-r", str(FPS), "-an"]
FIT = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1"
man = json.load(open(f"{AS}/manifest.json", encoding="utf-8")); LAY = man["layout"]
OVERLAY_ONLY = bool(os.environ.get("OVERLAY_ONLY")); segs = []

def ff(args): subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-nostdin"] + args, check=True)
def dur(p): return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout)
def decoded(p): return len(subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-f", "s16le", "-ac", "1", "-ar", "44100", "-"], capture_output=True).stdout) / 88200
clock, done = 0.0, 0
def nframes(d):
    global clock, done
    clock += d; n = round(clock * FPS) - done; done += n; return n
def run_video(inputs, fc, n):
    if OVERLAY_ONLY: segs.append(None); return
    args = []
    for i in inputs: args += i
    p = f"{SEG}/s{len(segs):02d}.mp4"; segs.append(p)
    ff(args + ["-filter_complex", fc, "-map", "[v]", "-frames:v", str(n)] + ENC + [p])
def loop(p): return ["-loop", "1", "-i", p]

def clip(src, d, start=0.0, qr=True, trim_bottom=0.0):
    # generated shots carry the corner QR (300 px, as in the yacht film); the yacht character shot does not.
    # trim_bottom crops off old burned-in English text at the foot of a raw v13 clip before the frame is filled.
    n = nframes(d); de = n / FPS; sp = max(1.0, de / (dur(src) - start))
    pre = f"crop=iw:ih*{1 - trim_bottom:.3f}:0:0," if trim_bottom else ""
    chain = f"[0:v]{pre}{FIT},setpts={sp:.4f}*(PTS-STARTPTS),fps={FPS},tpad=stop_mode=clone:stop_duration=1"
    if qr: run_video([["-ss", str(start), "-i", src], loop(QR)], chain + "[b];[1:v]scale=300:300:flags=lanczos[q];[b][q]overlay=W-w-56:H-h-56[v]", n)
    else: run_video([["-ss", str(start), "-i", src]], chain + "[v]", n)
def split_still(name, d):
    n = nframes(d)
    run_video([loop(f"{AS}/split_{name}.png")], f"[0:v]scale={W*2}:{H*2},zoompan=z='min(zoom+0.00022,1.025)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS}[v]", n)
def split_rec(start, srcdur, d):
    n = nframes(d); sp = srcdur / (n / FPS); r = LAY["rec"]
    fc = (f"[0:v]trim=start={start}:duration={srcdur},setpts=(PTS-STARTPTS)/{sp:.4f},fps={FPS},tpad=stop_mode=clone:stop_duration=1,"
          f"crop=iw:ih*0.86:0:ih*0.07,scale={r['w']}:{r['h']},format=rgba[v0];[2:v]format=gray,scale={r['w']}:{r['h']}[m];[v0][m]alphamerge[ph];"
          f"[1:v]fps={FPS}[bg];[bg][ph]overlay={r['x']}:{r['y']}:shortest=1[v]")
    run_video([["-i", REC_CHAT], loop(f"{AS}/panel_phone.png"), loop(f"{AS}/mask_rec.png")], fc, n)
FAILBOX = (166, 202, 788, 140)       # the failing row + its Fix line, where every guided stop parks it (crop coords, measured)
TOPFIX = (166, 214, 788, 178)        # "Top fixes, in priority order" + the three fixes
def split_audit(start, srcdur, d, crop_y=236, box=None, zc=(540, 304), zmax=1.08):
    # the real audit page inside the wide split, now with a slow push-in so it never sits still, and - on a failing check - a gold
    # frame around the row and its fix (Elena: "make it fire"; the owner's eye goes straight to what is wrong and how to fix it)
    n = nframes(d); sp = srcdur / (n / FPS); a = LAY["audit"]; cx, cy = zc
    hl = ""
    if box:
        x, y, w, h = box
        hl = (f"drawbox=x={x-8}:y={y-8}:w={w+16}:h={h+16}:color=0xEDB867@0.35:t=2:enable='gte(t,0.35)',"
              f"drawbox=x={x}:y={y}:w={w}:h={h}:color=0xEDB867@0.10:t=fill:enable='gte(t,0.35)',"
              f"drawbox=x={x}:y={y}:w={w}:h={h}:color=0xEDB867@0.95:t=4:enable='gte(t,0.35)',")
    zp = (f"scale=2160:1216,zoompan=z='min(1+({zmax}-1)*on/{max(1, n - 1)},{zmax})':x='max(0,min(iw-iw/zoom,{2*cx}-iw/zoom/2))':"
          f"y='max(0,min(ih-ih/zoom,{2*cy}-ih/zoom/2))':d=1:s=1080x608:fps={FPS}")
    fc = (f"[0:v]trim=start={start}:duration={srcdur},setpts=(PTS-STARTPTS)/{sp:.4f},fps={FPS},tpad=stop_mode=clone:stop_duration=1,"
          f"crop=1080:608:400:{crop_y},{hl}{zp},format=rgba[v0];[2:v]format=gray[m];[v0][m]alphamerge[pg];[1:v]fps={FPS}[bg];[bg][pg]overlay={a['x']}:{a['y']}:shortest=1[v]")
    run_video([["-i", REC_AUD], loop(f"{AS}/panel_wide.png"), loop(f"{AS}/mask_audit.png")], fc, n)
def card(file, d):
    n = nframes(d); de = n / FPS
    run_video([loop(f"{AS}/{file}")], f"[0:v]scale={W*2}:{H*2},zoompan=z='min(zoom+0.0002,1.02)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS},"
              f"fade=t=in:st=0:d=0.4,fade=t=out:st={de-0.4:.3f}:d=0.4[v]", n)

# ---- voice clock ----
PAUSE = {"a01": .8, "a02": .8, "a03": 1.0, "a04": .8, "a05": .7, "a06": .8, "a07": .8, "a08": .8, "a09": .8, "a10": .8, "a11": 1.0, "a12": .9, "a13": 4.0}
INTRO = 1.2
L = {k: decoded(f"{VO}/{k}.mp3") for k in PAUSE}; blk = {k: L[k] + PAUSE[k] for k in PAUSE}
start, t = {}, INTRO
for k in PAUSE: start[k] = t; t += blk[k]
print("starts:", {k: round(v, 2) for k, v in start.items()}, "end:", round(t, 2))

# B1 — the hook on the v19 mango + the opening title
clip(f"{V19}/mango.mp4", INTRO + blk["a01"], start=0.3)
# B2 — Google ranked your page: the v13 pomegranate (72 / 100), then the v19 papaya
b = blk["a02"]; clip(f"{V13}/split.mp4", 3.1, start=0.5); clip(f"{V19}/papaya.mp4", b - 3.1, start=0.5)
# B3 — your next customer asks ChatGPT first: the yacht guest at midnight -> her real typing -> the real answer (names blurred)
b = blk["a03"]; clip(f"{B}/clips/G2b__hailuo.mp4", 2.6, qr=False); split_rec(26.0, 24.0, 3.0); split_rec(48.0, 8.5, 2.4); split_still("S1_chatgpt_answer", b - 8.0)
# B4 — find out free: the live /api, atuona.xyz typed, Audit
split_audit(1.0, 9.8, blk["a04"])
# B5 — one score out of a hundred: the v13 hand with the 100/100 card -> the real 93
b = blk["a05"]; clip(f"{V13}/hand.mp4", 1.5, start=0.5); split_audit(15.6, 4.0, b - 1.5, crop_y=472, zc=(520, 400), zmax=1.15)   # framed on the 93 ring
# B6 — 34 checks in four groups: the v13 crystal shot + the groups card
clip(f"{V13}/grapes.mp4", blk["a06"], start=0.3)
# B7 — group 1, AI crawler access: the v13 crawler robots -> real engines panel -> real crawler rows
b = blk["a07"]; clip(f"{V13}/crawlers.mp4", 3.4, start=0.3, trim_bottom=0.13); split_audit(23.0, 3.6, 3.6); split_audit(53.2, 3.7, b - 7.0, zc=(560, 300), zmax=1.12)
# B8 — group 2, structured data: a passing identity row -> the failing answer-schema row and its fix
b = blk["a08"]; split_audit(73.8, 3.6, 2.9); split_audit(62.95, 4.3, b - 2.9, box=FAILBOX, zc=(560, 272), zmax=1.15)
# B9 — group 3, answer-readiness (the biggest): question headings FAIL + fix -> lists FAIL + fix
b = blk["a09"]; split_audit(83.25, 4.3, 5.3, box=FAILBOX, zc=(560, 272), zmax=1.15); split_audit(94.5, 4.3, b - 5.3, box=FAILBOX, zc=(560, 272), zmax=1.15)
# B10 — group 4, technical: HTTPS + 786 ms -> content present without JavaScript
b = blk["a10"]; split_audit(105.5, 3.6, 2.4); split_audit(115.95, 3.5, b - 2.4)
# B11 — the money shot: top fixes, in priority order
split_audit(43.4, 4.3, blk["a11"], box=TOPFIX, zc=(560, 300), zmax=1.15)
# B12 — being found is step one: the yacht film's operator screens
b = blk["a12"]; split_still("S2_whatsapp", 2.8); split_still("S6a_tg_send_edit_skip", 2.8); split_still("S8_hubspot_activity", b - 5.6)
# B13 — run yours free: the v19 starfruit -> the split end card
b = blk["a13"]; clip(f"{V19}/starfruit.mp4", 1.9, start=1.0); card("card_end.png", b - 1.9)

pic = f"{OUTD}/picture.mp4"
if not OVERLAY_ONLY:
    lst = f"{OUTD}/list.txt"; open(lst, "w").write("".join(f"file '{p}'\n" for p in segs))
    ff(["-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", pic])

# ---- voice track: lines + pauses, joined with the concat FILTER, loudness-normalised ----
args, fc, n = [], [], 0
def sil(d):
    global n; args.extend(["-f", "lavfi", "-t", f"{d:.3f}", "-i", "anullsrc=r=44100:cl=mono"]); fc.append(f"[{n}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono[a{n}]"); n += 1
def line(p):
    global n; args.extend(["-i", p]); fc.append(f"[{n}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono[a{n}]"); n += 1
sil(INTRO)
for k in PAUSE: line(f"{VO}/{k}.mp3"); sil(PAUSE[k])
voice = f"{OUTD}/voice.m4a"
ff(args + ["-filter_complex", ";".join(fc) + ";" + "".join(f"[a{i}]" for i in range(n)) + f"concat=n={n}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=7,aformat=channel_layouts=stereo[out]",
           "-map", "[out]", "-ar", "44100", "-c:a", "aac", "-b:a", "192k", voice])

# ---- overlay pass: scrims, captions, line items (title, groups, labels), each fading on the voice clock ----
items = []
for k in sorted({c["line"] for c in man["captions"]}): items.append((start[k] - 0.1, start[k] + L[k] + 0.35, man["scrim"]))
for c in man["captions"]: items.append((start[c["line"]] + c["t0"] + 0.03, min(start[c["line"]] + c["t1"], start[c["line"]] + L[c["line"]] + 0.25), c))
for c in man["line_items"] + man["absolute"]:
    a = max(0.05, start[c["line"]] + c["t0"]); z = start[c["line"]] + (c["t1"] if c.get("t1") is not None else blk[c["line"]] - 0.05)
    items.append((a, z, c))
args, fc, last = ["-i", pic], [], "0:v"
for i, (a, z, c) in enumerate(items, 1):
    args += ["-framerate", str(FPS), "-loop", "1", "-t", f"{z + 0.2:.3f}", "-i", f"{AS}/{c['file']}"]
    fi = min(0.22, (z - a) / 4)
    fc.append(f"[{i}:v]format=rgba,fade=t=in:st={a:.3f}:d={fi:.3f}:alpha=1,fade=t=out:st={z - fi:.3f}:d={fi:.3f}:alpha=1[o{i}];"
              f"[{last}][o{i}]overlay={c['x']}:{c['y']}:eof_action=pass[v{i}]"); last = f"v{i}"
pic_es = f"{OUTD}/picture_es.mp4"
ff(args + ["-filter_complex", ";".join(fc), "-map", f"[{last}]", "-frames:v", str(done)] + ENC + [pic_es])
print(json.dumps({"segments": len(segs), "frames": done, "picture_es_s": round(dur(pic_es), 3), "voice_s": round(dur(voice), 3), "timeline_s": round(t, 3), "overlays": len(items)}))
