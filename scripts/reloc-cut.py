# RELOCATION film (ICP #3, 2 Oct 2026) - "They Asked ChatGPT Before They Messaged Your Real Estate Agency - or Your Law Firm".
# Runs on Oracle in ~/aigo-reloc. The villa film's machinery (villa-cut.py): one frame clock from decoded voice + pauses,
# segments -> concat -> one overlay pass (captions, titles, chips, cards). Story: Chicago, Thursday 23:52 (real aerial + title)
# -> the mother asks ChatGPT, her son beside her -> her REAL ChatGPT recording (cut at "Searching the web", zero answer text)
# -> the son's real WhatsApp -> Friday: the agent shows a house / the lawyer with another family -> Monday (real Punta Pacifica)
# -> too late -> REWIND (Elena: "it is genuine") -> the fresh real audit -> both send the forms -> real Zoho + Telegram -> both
# owners read and nod (split) -> SENT, Gmail, HubSpot -> every morning -> ICP card over real Casco Viejo -> P1 Casco arrival ->
# P2 Boquete terrace (held through the music beat) -> reveal over real Chiriqui -> end card. Assets: reloc-assets.py.
import json, os, subprocess

B = os.path.expanduser("~/aigo-reloc"); Y = os.path.expanduser("~/aigo-promo")
W, H, FPS = 1920, 1080, 24
AS, VO, CL, ST = f"{B}/assets", f"{B}/voice", f"{B}/clips", f"{B}/stock"
QR = f"{Y}/img/brand_qr.png"
REC = f"{B}/captures/S1_chatgpt.mp4"; AUD = f"{B}/rec/S3_audit.mp4"
OUTD = f"{B}/cut1"; SEG = f"{OUTD}/seg"; os.makedirs(SEG, exist_ok=True)
ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-r", str(FPS), "-an"]
FIT = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1"
man = json.load(open(f"{AS}/manifest.json", encoding="utf-8")); LAY = man["layout"]
OVERLAY_ONLY = bool(os.environ.get("OVERLAY_ONLY")); segs = []; SH = {}

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
def shot(name, fn, *a, **k):   # remember where each shot sits on the film clock (chips are timed to shots)
    t0 = clock; fn(*a, **k); SH[name] = (t0, clock)

def clip(name, d, start=0.0, qr=False, src=None, grade="", zoom=1.0):
    n = nframes(d); de = n / FPS
    src = src or f"{CL}/{name}.mp4"; sp = max(1.0, de / (dur(src) - start))
    z = f",scale={round(W*zoom)}:{round(H*zoom)},crop={W}:{H}" if zoom != 1.0 else ""
    chain = f"[0:v]{FIT}{z},setpts={sp:.4f}*(PTS-STARTPTS),fps={FPS},tpad=stop_mode=clone:stop_duration=3" + (f",{grade}" if grade else "")
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
          f"crop=iw:ih*0.86:0:ih*0.07,scale={r['w']}:{r['h']},format=rgba[v0];[2:v]format=gray,scale={r['w']}:{r['h']}[m];[v0][m]alphamerge[ph];"
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
PAUSE = {"s01": .8, "s02": 1.0, "s03": 1.4, "s04": 2.0, "s05": .8, "s06": .8, "s07": .8, "s08": .9, "s09": 1.0, "s10": 2.0, "s11": 1.2, "s12": 2.5}
INTRO = 1.5
L = {k: decoded(f"{VO}/{k}.mp3") for k in PAUSE}; blk = {k: L[k] + PAUSE[k] for k in PAUSE}
start, t = {}, INTRO
for k in PAUSE: start[k] = t; t += blk[k]
print("starts:", {k: round(v, 2) for k, v in start.items()}, "end:", round(t, 2))
PP = f"{ST}/pexels_33811915.mp4"   # real Punta Pacifica / Paitilla (the son's condo district)

# B1 - Chicago, Thursday 23:52: the real night aerial (title) -> HER (Kling, first face, Dramatizacion chip) -> her son -> the question
b = INTRO + blk["s01"]
shot("R0", clip, "R0", 3.4, start=7.0, src=f"{ST}/pexels_36244311.mp4")
shot("A2", clip, "A2__kling", 2.25); shot("A1", clip, "A1__hailuo", 1.9)
shot("S1a", split_rec, 2.95, 0.6, b - 7.55)
# B2 - sent -> thinking -> "Searching the web" (CUT there) -> the businesses it can (or cannot) understand: real Casco Viejo
b = blk["s02"]; shot("S1b", split_rec, 3.55, 3.70, 4.3)
shot("CASCO_B2", clip, "CASCO_B2", b - 4.3, start=4.3, qr=True, src=f"{ST}/pexels_35257068.mp4")
# B3 - the son's real WhatsApp -> Friday: the agent shows a house / the lawyer with another family -> Monday -> too late
b = blk["s03"]; shot("S2", split_still, "S2_whatsapp", 2.0)
shot("A3", clip, "A3__hailuo", 1.9); shot("A4", clip, "A4__hailuo", 2.4)
shot("R1", clip, "R1", 1.4, start=4.9, qr=True, src=PP)
shot("VALLEY", clip, "VALLEY", b - 7.7, start=0.3, qr=True, src=f"{ST}/pexels_36770925.mp4")
# B4 - the thesis
shot("C4", card_png, "card_s04.png", blk["s04"])
# B5 - REWIND (Monday -> the lawyer -> the agent -> her son, backwards) -> her again, the same question
b = blk["s05"]; shot("RW1", reverse_src, PP, 4.9, 1.4, 0.6); shot("RW2", reverse, "A4__hailuo", 0.6); shot("RW3", reverse, "A3__hailuo", 0.6)
shot("RW4", reverse, "A1__hailuo", 0.5); shot("A2s", still, "kA2", b - 2.3)
# B6 - the fresh real audit: the score appears -> the category bars -> the top fixes (the audited address blurred)
b = blk["s06"]
shot("S3a", split_audit, 21.7, 2.3, 2.6, 470, [(160, 128, 340, 52), (318, 382, 350, 46)])
shot("S3b", split_audit, 30.8, 3.3, 2.9, 0, [(318, 36, 350, 46)])
shot("S3c", split_audit, 41.0, 4.9, b - 5.5, 100)
# B7 - she sends the agency's form, he the firm's -> the inquiry lands in the owner's inbox (Zoho) -> the drafted reply (Telegram)
b = blk["s07"]; shot("A6", clip, "A6__hailuo", 2.7)
shot("S4z", split_still, "S4_zoho_inquiry", 1.6); shot("S4t", split_still, "S4_tg_card_draft", b - 4.3)
# B8 - the same Friday: both owners read the draft and nod -> SENT -> the client's inbox -> logged in HubSpot
b = blk["s08"]; shot("A7", split_two, "A7L__hailuo", "A7R__hailuo", 2.7, 2.0, 160, 330)
shot("S5t", split_still, "S5_tg_sent", 1.5); shot("S5g", split_still, "S5_gmail_reply", 1.4)
shot("S5h", split_still, "S5_hubspot_activity", b - 5.6)
# B9 - every morning: HubSpot + who's new / warm / slipping away
shot("S9", split_still, "S9_hubspot_deal", blk["s09"], zoom=0.00012)
# B10 - the ICP card over real Casco Viejo -> P1 the law firm's win (both clients) -> P2 the agency's win, her last smile, held
b = blk["s10"]; shot("R2", clip, "R2", 4.4, start=9.7, qr=True, src=f"{ST}/pexels_29754758.mp4")
shot("P1", clip, "P1__kling", 3.0); shot("P2", clip, "P2__kling", b - 7.4, start=2.0)
# B11 - the reveal over real Chiriqui highlands (car-window edge cropped by a 1.18 zoom) · B12 - Punta Pacifica -> end card
shot("R3", clip, "R3", blk["s11"], start=1.0, qr=False, src=f"{ST}/pexels_38893319.mp4", zoom=1.18)
b = blk["s12"]; shot("R1b", clip, "R1b", 1.8, start=8.0, qr=True, src=PP); shot("END", card_png, "card_s12.png", b - 1.8)
print("shots:", {k: (round(a, 2), round(z, 2)) for k, (a, z) in SH.items()})

pic = f"{OUTD}/picture.mp4"
if not OVERLAY_ONLY:
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
    items.append((max(0.05, a), z, c))
CH = man["chips"]
def chip_at(shotname, chipname, where="tl", a=0.15, z=None, dz=0.1):
    s0, s1 = SH[shotname]; c = CH[chipname]
    x = 20 if where == "tl" else W - c["w"] - 20; y = 20
    if isinstance(where, tuple): x, y = where
    items.append((s0 + a, (s0 + z) if z is not None else s1 - dz, {"file": c["file"], "x": x, "y": y}))
items.append((SH["R0"][0] + 0.25, SH["R0"][1] - 0.1, {"file": "title_open.png", "x": 0, "y": 0}))
chip_at("R0", "chip_chicago", "tr", a=0.25)
chip_at("A2", "chip_drama", "tl", a=0.1, z=2.1)
chip_at("A3", "chip_inmob", "tl"); chip_at("A4", "chip_bufete", "tl"); chip_at("R1", "chip_lunes", "tl")
chip_at("A7", "chip_inmob_short", (20, 980 - CH["chip_inmob_short"]["h"]))
chip_at("A7", "chip_bufete_short", (W - CH["chip_bufete_short"]["w"] - 20, 980 - CH["chip_bufete_short"]["h"]))
items.append((SH["A7"][0] + 0.1, SH["A7"][1] - 0.05, man["a7_card"]))
chip_at("P1", "chip_casco", "tr"); chip_at("P2", "chip_boquete", "tr", dz=0.6); chip_at("R3", "chip_chiriqui", "tl")
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
