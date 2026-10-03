# MEDICAL-TOURISM film (ICP #5, 3 Oct 2026) - "They Asked ChatGPT Before They Messaged Your Clinic". Copy of reloc-cut.py
# (runs on Oracle in ~/aigo-med): one frame clock from decoded voice + pauses, segments -> concat -> one overlay pass.
# Story (plan docs/selling/video/2026-10-03_MEDTOUR_COLOMBIA_FILM_PLAN.md): Dallas, Thursday 23:48 (real Reunion Tower aerial +
# title) -> him (still push-in, "for him") -> her (Kling, "for her") -> her REAL ChatGPT recording (cut at "Searching 9 websites",
# zero answer text) -> real Medellin -> Friday: the dentist scrubs in / the coordinator with another family -> Monday (real
# Coltejer) -> the two real WhatsApp threads (recreation) -> thesis -> REWIND -> the fresh real audit (our own page, 93 / A+)
# -> each sends a clinic's website form -> real Gmail ack + Telegram draft -> dentist and coordinator approve (split) -> SENT ->
# HubSpot -> the real deal-stage picker (every morning) -> ICP card over real Bogota/Monserrate -> Pixabay Medellin valley ->
# her consultation -> his dental chair -> her recovery (the coordinator's message) -> Cartagena after the final check-up (music)
# -> reveal over real Cartagena -> Elena's wave ending (real Bocagrande surf) -> end card. Assets: med-assets.py.
import json, os, subprocess

B = os.path.expanduser("~/aigo-med"); Y = os.path.expanduser("~/aigo-promo")
W, H, FPS = 1920, 1080, 24
AS, VO, CL, ST = f"{B}/assets", f"{B}/voice", f"{B}/clips", f"{B}/stock"
QR = f"{Y}/img/brand_qr.png"
REC = f"{B}/captures/chatgpt_take1.mp4"; AUD = f"{B}/rec/S3_audit.mp4"
OUTD = f"{B}/cut1"; SEG = f"{OUTD}/seg"; os.makedirs(SEG, exist_ok=True)
ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-r", str(FPS), "-an"]
FIT = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1"
man = json.load(open(f"{AS}/manifest.json", encoding="utf-8")); LAY = man["layout"]
OVERLAY_ONLY = bool(os.environ.get("OVERLAY_ONLY")); segs = []; SH = {}
REBUILD = {int(x) for x in os.environ.get("REBUILD", "").split(",") if x}   # re-render only these segment numbers (a baked card changed), keep the rest

def ff(args): subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-nostdin"] + args, check=True)
def dur(p): return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout)
def decoded(p): return len(subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-f", "s16le", "-ac", "1", "-ar", "44100", "-"], capture_output=True).stdout) / 88200
clock, done = 0.0, 0
def nframes(d):
    global clock, done
    clock += d; n = round(clock * FPS) - done; done += n; return n
def run_video(inputs, fc, n):
    if OVERLAY_ONLY and not REBUILD: segs.append(None); return
    args = []
    for i in inputs: args += i
    p = f"{SEG}/s{len(segs):02d}.mp4"; segs.append(p)
    if REBUILD and len(segs) - 1 not in REBUILD: return
    ff(args + ["-filter_complex", fc, "-map", "[v]", "-frames:v", str(n)] + ENC + [p])
def loop(p): return ["-loop", "1", "-i", p]
def shot(name, fn, *a, **k):   # remember where each shot sits on the film clock (chips are timed to shots)
    t0 = clock; fn(*a, **k); SH[name] = (t0, clock)

def clip(name, d, start=0.0, qr=False, src=None, grade="", zoom=1.0, pre=""):
    n = nframes(d); de = n / FPS
    src = src or f"{CL}/{name}.mp4"; sp = max(1.0, de / (dur(src) - start))
    z = f",scale={round(W*zoom)}:{round(H*zoom)},crop={W}:{H}" if zoom != 1.0 else ""
    chain = f"[0:v]{pre}{FIT}{z},setpts={sp:.4f}*(PTS-STARTPTS),fps={FPS},tpad=stop_mode=clone:stop_duration=3" + (f",{grade}" if grade else "")
    if qr: run_video([["-ss", str(start), "-i", src], loop(QR)], chain + "[b];[1:v]scale=300:300:flags=lanczos[q];[b][q]overlay=W-w-56:H-h-56[v]", n)
    else: run_video([["-ss", str(start), "-i", src]], chain + "[v]", n)
def reverse(name, d, speed=3.0, start=0.0):
    n = nframes(d)
    run_video([["-ss", str(start), "-i", f"{CL}/{name}.mp4"]], f"[0:v]{FIT},reverse,setpts=PTS/{speed},fps={FPS},tpad=stop_mode=clone:stop_duration=1,eq=saturation=0.55:contrast=1.1[v]", n)
def reverse_src(src, ss, srcdur, d):
    n = nframes(d); sp = srcdur / (n / FPS)
    run_video([["-ss", str(ss), "-t", str(srcdur), "-i", src]], f"[0:v]{FIT},reverse,setpts=PTS/{sp:.4f},fps={FPS},tpad=stop_mode=clone:stop_duration=1,eq=saturation=0.55:contrast=1.1[v]", n)
def still(img, d):
    n = nframes(d)
    run_video([loop(f"{B}/img/{img}.jpg")], f"[0:v]{FIT},scale={W*2}:{H*2},zoompan=z='min(zoom+0.0006,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS}[v]", n)
def split_still(name, d, zoom=0.00022):
    n = nframes(d)
    run_video([loop(f"{AS}/split_{name}.png")], f"[0:v]scale={W*2}:{H*2},zoompan=z='min(zoom+{zoom},1.025)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS}[v]", n)
def split_rec(start, srcdur, d):
    n = nframes(d); sp = srcdur / (n / FPS); r = LAY["rec"]
    fc = (f"[0:v]trim=start={start}:duration={srcdur},setpts=(PTS-STARTPTS)/{sp:.4f},fps={FPS},tpad=stop_mode=clone:stop_duration=2,"
          f"crop=iw:ih*0.82:0:ih*0.11,scale={r['w']}:{r['h']},format=rgba[v0];[2:v]format=gray,scale={r['w']}:{r['h']}[m];[v0][m]alphamerge[ph];"
          f"[1:v]fps={FPS}[bg];[bg][ph]overlay={r['x']}:{r['y']}:shortest=1[v]")
    run_video([["-i", REC], loop(f"{AS}/panel_phone.png"), loop(f"{AS}/mask_rec.png")], fc, n)
def split_audit(start, srcdur, d, cy, blurs=()):
    # the live audit page, centre column; the audited address is blurred (plan: domain cropped)
    n = nframes(d); sp = srcdur / (n / FPS); a = LAY["audit"]
    fc = f"[0:v]trim=start={start}:duration={srcdur},setpts=(PTS-STARTPTS)/{sp:.4f},fps={FPS},tpad=stop_mode=clone:stop_duration=2,crop=1080:608:420:{cy}[c0]"
    last = "c0"
    for i, (x, y, w, h) in enumerate(blurs):
        fc += f";[{last}]split[k{i}][s{i}];[s{i}]crop={w}:{h}:{x}:{y},boxblur=10:3[b{i}];[k{i}][b{i}]overlay={x}:{y}[c{i+1}]"; last = f"c{i+1}"
    fc += f";[{last}]format=rgba[v0];[2:v]format=gray[m];[v0][m]alphamerge[pg];[1:v]fps={FPS}[bg];[bg][pg]overlay={a['x']}:{a['y']}:shortest=1[v]"
    run_video([["-i", AUD], loop(f"{AS}/panel_wide.png"), loop(f"{AS}/mask_audit.png")], fc, n)
def split_two(lname, rname, d, start, lx, rx):
    # A7: the same Friday, side by side - the agent (left) and the lawyer (right) read the drafted reply and nod
    n = nframes(d)
    fc = (f"[0:v]{FIT},setpts=PTS-STARTPTS,fps={FPS},tpad=stop_mode=clone:stop_duration=2,crop=960:1080:{lx}:0[l];"
          f"[1:v]{FIT},setpts=PTS-STARTPTS,fps={FPS},tpad=stop_mode=clone:stop_duration=2,crop=960:1080:{rx}:0[r];"
          f"[l][r]hstack=2,drawbox=x=957:y=0:w=6:h={H}:color=0xEDB867@1:t=fill[v]")
    run_video([["-ss", str(start), "-i", f"{CL}/{lname}.mp4"], ["-ss", str(start), "-i", f"{CL}/{rname}.mp4"]], fc, n)
def card_png(file, d):
    n = nframes(d); de = n / FPS
    run_video([loop(f"{AS}/{file}")], f"[0:v]scale={W*2}:{H*2},zoompan=z='min(zoom+0.0002,1.02)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS},"
              f"fade=t=in:st=0:d=0.4,fade=t=out:st={de-0.4:.3f}:d=0.4[v]", n)

# ---- voice clock ----
# s10 carries ~9.5 s of music alone after its 9.0 s take (plan §3: written explicitly, never left to the engine) - T3 + P2 under music
PAUSE = {"s01": .8, "s02": 1.0, "s03": 1.4, "s04": 2.0, "s05": .8, "s06": .8, "s07": .8, "s08": .9, "s09": 1.0, "s10": 9.5, "s11": 1.2, "s12": 2.5}
INTRO = 1.5
L = {k: decoded(f"{VO}/{k}.mp3") for k in PAUSE}; blk = {k: L[k] + PAUSE[k] for k in PAUSE}
start, t = {}, INTRO
for k in PAUSE: start[k] = t; t += blk[k]
print("starts:", {k: round(v, 2) for k, v in start.items()}, "end:", round(t, 2))
BRIGHT = "eq=brightness=-0.10:contrast=1.08:saturation=1.12"   # bright real aerials darkened so the serif captions read
MIST = "eq=brightness=-0.15:contrast=1.12:saturation=1.10"
SURF = "eq=contrast=1.22:saturation=1.35:gamma=0.97,eq=brightness=-0.10"   # the flat/log Bocagrande clip (verifier's tested grade)
COLTEJER = f"{ST}/pexels_31563421.mp4"
# v2 (Elena 3 Oct): the hand-washing scrub-room shot is replaced by the dentist working in his operatory (kA3b, Hailuo).
# A3_CLIP=A3__hailuo rebuilds v1.
A3_CLIP = os.environ.get("A3_CLIP", "A3b__hailuo")

# B1 - Dallas, Thursday 23:48: the real Reunion Tower aerial (title) -> HIM ("dental implants for him", first face, Dramatizacion
# chip, a push-in on the still) -> HER (Kling, "a cosmetic procedure for her") -> her real ChatGPT question
b = INTRO + blk["s01"]
shot("R0", clip, "R0", 3.5, start=0.5, src=f"{ST}/pexels_16600939.mp4")
shot("A1", still, "kA1", 2.0); shot("A2", clip, "A2__kling", 2.4, start=0.3)
shot("S1a", split_rec, 2.6, 1.4, b - 7.9)
# B2 - "Searching the web" -> her own words about checking reply speed -> "Searching 9 websites" (CUT, before any clinic name)
# -> the clinics it can understand: real Medellin (the Metropolitan Cathedral, no people at scale) with the QR
b = blk["s02"]; shot("S1b", split_rec, 4.0, 5.9, 6.0)
shot("MED_B2", clip, "MED_B2", b - 6.0, start=1.5, qr=True, src=f"{ST}/pexels_31563691.mp4", grade=BRIGHT)
# B3 - Friday: the dentist scrubs in for a long surgery / the coordinator with another family -> Monday (real Coltejer) ->
# the two real WhatsApp threads: the clinics answer Monday, the couple already chose someone else
b = blk["s03"]; shot("A3", clip, A3_CLIP, 4.2, start=0.2)
shot("A4", clip, "A4__hailuo", 2.35, start=2.2)
shot("R1", clip, "R1", 1.25, start=1.0, qr=True, src=COLTEJER, grade=BRIGHT)
shot("S2d", split_still, "S2b_dental", 2.1); shot("S2s", split_still, "S2b_surgery", b - 9.9)
# B4 - the thesis
shot("C4", card_png, "card_s04.png", blk["s04"])
# B5 - REWIND (the threads -> Monday -> the coordinator -> the dentist, backwards) -> her again, live, the same question
b = blk["s05"]; shot("RW1", reverse_src, COLTEJER, 1.0, 1.25, 0.6); shot("RW2", reverse, "A4__hailuo", 0.6, start=2.2)
shot("RW3", reverse, A3_CLIP, 0.6); shot("A2s", clip, "A2__kling", b - 1.8, start=0.6)
# B6 - the fresh real audit of our own page: 93 / A+ -> the category bars -> the three top fixes (the address blurred)
b = blk["s06"]
shot("S3a", split_audit, 21.7, 2.3, 2.6, 470, [(184, 132, 236, 44), (326, 398, 280, 42)])
shot("S3b", split_audit, 30.8, 3.3, 2.9, 0, [(326, 52, 280, 42)])
shot("S3c", split_audit, 39.4, 4.6, b - 5.5, 100)   # hold on the three top fixes (the capture scrolls back up at ~44.2 s)
# B7 - each writes to a clinic's website form -> the instant acknowledgement (real Gmail) -> the drafted reply (real Telegram)
b = blk["s07"]; shot("A6", clip, "A6__hailuo", 2.3, start=0.5)
shot("S4g", split_still, "S4_gmail_ack", 1.7); shot("S4t", split_still, "S4_tg_card_draft", b - 4.0)
# B8 - the same Friday: the dentist (between cases) and the coordinator read the draft and nod -> SENT -> logged in HubSpot
b = blk["s08"]; shot("A7", split_two, "A7L__hailuo", "A7R__hailuo", 2.7, 1.2, 480, 300)
shot("S5t", split_still, "S5_tg_sent", 1.6); shot("S5h", split_still, "S5_hubspot_activity", b - 4.3)
# B9 - every morning: the real HubSpot deal stages + who's new / warm / slipping away
shot("S9", split_still, "S9_hubspot_deal", blk["s09"], zoom=0.00012)
# B10 - ICP card over real Bogota (Monserrate) -> the real Medellin valley (Pixabay) -> her consultation -> his dental chair ->
# her recovery (the coordinator's message) -> Cartagena after the final check-up, held through the music
b = blk["s10"]; shot("R2", clip, "R2", 4.0, start=20.0, qr=True, src=f"{ST}/pexels_18092718.mp4", grade=BRIGHT)
shot("VAL", clip, "VAL", 1.5, start=3.0, src=f"{ST}/pixabay_249191.mp4", grade=BRIGHT)
shot("T2", clip, "T2__hailuo", 3.0, start=0.8); shot("T1", clip, "T1__hailuo", 3.0, start=0.2)
shot("T3", clip, "T3__hailuo", 3.0, start=0.2); shot("P2", clip, "P2__kling", b - 14.5, start=0.2)
# B11 - the reveal over real Cartagena (the cathedral belfry, the walled city, Bocagrande beyond; pools cropped out)
shot("R3", clip, "R3", blk["s11"], start=11.0, src=f"{ST}/pexels_30391239.mp4", pre="crop=2240:1260:0:0,")
# B12 - Elena's wave ending: real Caribbean surf along Bocagrande (native 1920 window), QR -> end card
b = blk["s12"]; shot("R3b", clip, "R3b", 2.2, start=14.2, qr=True, src=f"{ST}/pexels_26591185.mp4", grade=SURF, pre="crop=1920:1080:600:0,")
shot("END", card_png, "card_s12.png", b - 2.2)
print("shots:", {k: (round(a, 2), round(z, 2)) for k, (a, z) in SH.items()})

pic = f"{OUTD}/picture.mp4"
if not OVERLAY_ONLY or REBUILD:
    lst = f"{OUTD}/list.txt"; open(lst, "w").write("".join(f"file '{p}'\n" for p in segs))
    ff(["-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", pic])

# ---- voice track ----
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

# ---- overlay pass ----
items = []
for k in sorted({c["line"] for c in man["captions"]}): items.append((start[k] - 0.1, start[k] + L[k] + 0.35, man["scrim"]))
for c in man["captions"]: items.append((start[c["line"]] + c["t0"], min(start[c["line"]] + c["t1"], start[c["line"]] + L[c["line"]] + 0.25), c))
for c in man["titles"]: items.append((start[c["line"]] + c["t0"], start[c["line"]] + (c["t1"] if c["t1"] is not None else blk[c["line"]]), c))
for c in man["kinetic"]: items.append((start[c["line"]] + c["t0"], start[c["line"]] + blk[c["line"]] - 0.05, c))
for c in man.get("absolute", []):
    if c.get("line"):
        a = start[c["line"]] + c["a"]; z = start[c["line"]] + (c["z"] if c.get("z") is not None else blk[c["line"]] - 0.05)
    else: a, z = c["a"], c["z"]
    if str(c.get("file", "")).startswith("icp_"): z = min(z, SH["R2"][1] - 0.08)   # the ICP card lives on the Bogota aerial only
    items.append((max(0.05, a), z, c))
CH = man["chips"]
def chip_at(shotname, chipname, where="tl", a=0.15, z=None, dz=0.1):
    s0, s1 = SH[shotname]; c = CH[chipname]
    x = 20 if where == "tl" else W - c["w"] - 20; y = 20
    if isinstance(where, tuple): x, y = where
    items.append((s0 + a, (s0 + z) if z is not None else s1 - dz, {"file": c["file"], "x": x, "y": y}))
items.append((SH["R0"][0] + 0.25, SH["R0"][1] - 0.1, {"file": "title_open.png", "x": 0, "y": 0}))
chip_at("R0", "chip_dallas", "tr", a=0.25)
chip_at("A1", "chip_drama", "tl", a=0.1, z=1.95)
chip_at("A3", "chip_dental", "tl"); chip_at("A4", "chip_surgery", "tl"); chip_at("R1", "chip_lunes", "tl")
chip_at("A7", "chip_dental_short", (20, 980 - CH["chip_dental_short"]["h"]))
chip_at("A7", "chip_surgery_short", (W - CH["chip_surgery_short"]["w"] - 20, 980 - CH["chip_surgery_short"]["h"]))
items.append((SH["A7"][0] + 0.1, SH["A7"][1] - 0.05, man["a7_card"]))
chip_at("R2", "chip_bogota", "tr", a=0.2)
chip_at("VAL", "chip_med_nov", "tl", a=0.1, z=None); chip_at("T2", "chip_med_nov", "tl", a=0.0); chip_at("T1", "chip_med_nov", "tl", a=0.0)
chip_at("T3", "chip_recovery", "tl")
items.append((SH["T3"][0] + 0.25, SH["T3"][1] - 0.05, {"file": "t3_bubble.png", "x": 0, "y": 0}))
chip_at("P2", "chip_cartagena_p2", "tl", dz=0.4); chip_at("R3", "chip_cartagena", "tl")
items.append((SH["R3"][0] + 0.05, SH["R3"][1] - 0.05, {"file": "reveal_s11.png", "x": 0, "y": 0}))
args, fc, last = ["-i", pic], [], "0:v"
for i, (a, z, c) in enumerate(items, 1):
    args += ["-framerate", str(FPS), "-loop", "1", "-t", f"{z + 0.2:.3f}", "-i", f"{AS}/{c['file']}"]
    fi = min(0.22, (z - a) / 4)
    fc.append(f"[{i}:v]format=rgba,fade=t=in:st={a:.3f}:d={fi:.3f}:alpha=1,fade=t=out:st={z - fi:.3f}:d={fi:.3f}:alpha=1[o{i}];"
              f"[{last}][o{i}]overlay={c['x']}:{c['y']}:eof_action=pass[v{i}]"); last = f"v{i}"
pic_es = f"{OUTD}/picture_es.mp4"
ff(args + ["-filter_complex", ";".join(fc), "-map", f"[{last}]", "-frames:v", str(done)] + ENC + [pic_es])
json.dump({"start": start, "L": L, "blk": blk, "shots": SH}, open(f"{OUTD}/clock.json", "w"), indent=1)
print(json.dumps({"segments": len(segs), "frames": done, "picture_es_s": round(dur(pic_es), 3), "voice_s": round(dur(voice), 3), "timeline_s": round(t, 3), "overlays": len(items)}))
