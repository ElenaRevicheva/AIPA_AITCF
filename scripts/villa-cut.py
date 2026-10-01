# VILLA + CHARTER film (ICP #2, 1 Oct 2026) - "She Asked ChatGPT Before She Booked Your Island". Runs on Oracle in ~/aigo-villa.
# The yacht film's machinery (aigo-promo-cut5.py) with the villa story: Toronto mother at midnight -> the host at sea on Sunday ->
# Wednesday, too late -> rewind -> the real audit and real screens (reused from the yacht film, Elena: "nobody will pay much
# attention") -> CHARTER FLIGHT -> airstrip -> BOAT TRANSFER -> the payoff on the villa dock -> the villa morning -> New Year.
# Narration v2 LOCKED (villa-vo.py). Assets: villa-assets.py -> assets/. Timing: decoded voice + pauses, one frame clock.
import json, os, subprocess

B = os.path.expanduser("~/aigo-villa"); Y = os.path.expanduser("~/aigo-promo")
W, H, FPS = 1920, 1080, 24
AS, VO, CL = f"{B}/assets", f"{B}/voice", f"{B}/clips"
QR = f"{Y}/img/brand_qr.png"
REC = f"{Y}/captures/elena-phone-20260930-take3/S1_chatgpt_recording.mp4"; AUD = f"{Y}/rec/S3_audit_atuona.mp4"
OUTD = f"{B}/cut1"; SEG = f"{OUTD}/seg"; os.makedirs(SEG, exist_ok=True)
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

def clip(name, d, start=0.0, qr=False, src=None, grade=""):
    # frames without the family or the host carry the corner QR (300 px), as in the yacht film
    n = nframes(d); de = n / FPS
    src = src or f"{CL}/{name}.mp4"; sp = max(1.0, de / (dur(src) - start))
    chain = f"[0:v]{FIT},setpts={sp:.4f}*(PTS-STARTPTS),fps={FPS},tpad=stop_mode=clone:stop_duration=1" + (f",{grade}" if grade else "")
    if qr: run_video([["-ss", str(start), "-i", src], loop(QR)], chain + "[b];[1:v]scale=300:300:flags=lanczos[q];[b][q]overlay=W-w-56:H-h-56[v]", n)
    else: run_video([["-ss", str(start), "-i", src]], chain + "[v]", n)
def reverse(name, d, speed=3.0):
    n = nframes(d)
    run_video([["-i", f"{CL}/{name}.mp4"]], f"[0:v]{FIT},reverse,setpts=PTS/{speed},fps={FPS},eq=saturation=0.55:contrast=1.1[v]", n)
def still(img, d):
    n = nframes(d)
    run_video([loop(f"{B}/img/{img}.jpg")], f"[0:v]{FIT},scale={W*2}:{H*2},zoompan=z='min(zoom+0.0006,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS}[v]", n)
def split_still(name, d, zoom=0.00022):
    n = nframes(d)
    run_video([loop(f"{AS}/split_{name}.png")], f"[0:v]scale={W*2}:{H*2},zoompan=z='min(zoom+{zoom},1.025)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS}[v]", n)
def split_rec(start, srcdur, d):
    n = nframes(d); sp = srcdur / (n / FPS); r = LAY["rec"]
    fc = (f"[0:v]trim=start={start}:duration={srcdur},setpts=(PTS-STARTPTS)/{sp:.4f},fps={FPS},tpad=stop_mode=clone:stop_duration=1,"
          f"crop=iw:ih*0.86:0:ih*0.07,scale={r['w']}:{r['h']},format=rgba[v0];[2:v]format=gray,scale={r['w']}:{r['h']}[m];[v0][m]alphamerge[ph];"
          f"[1:v]fps={FPS}[bg];[bg][ph]overlay={r['x']}:{r['y']}:shortest=1[v]")
    run_video([["-i", REC], loop(f"{AS}/panel_phone.png"), loop(f"{AS}/mask_rec.png")], fc, n)
def split_audit(start, srcdur, d):
    n = nframes(d); sp = srcdur / (n / FPS); a = LAY["audit"]
    fc = (f"[0:v]trim=start={start}:duration={srcdur},setpts=(PTS-STARTPTS)/{sp:.4f},fps={FPS},tpad=stop_mode=clone:stop_duration=1,"
          f"crop=1080:608:400:230,format=rgba[v0];[2:v]format=gray[m];[v0][m]alphamerge[pg];[1:v]fps={FPS}[bg];[bg][pg]overlay={a['x']}:{a['y']}:shortest=1[v]")
    run_video([["-i", AUD], loop(f"{AS}/panel_wide.png"), loop(f"{AS}/mask_audit.png")], fc, n)
def card_png(file, d):
    n = nframes(d); de = n / FPS
    run_video([loop(f"{AS}/{file}")], f"[0:v]scale={W*2}:{H*2},zoompan=z='min(zoom+0.0002,1.02)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS},"
              f"fade=t=in:st=0:d=0.4,fade=t=out:st={de-0.4:.3f}:d=0.4[v]", n)

# ---- voice clock (same pauses as the yacht film) ----
PAUSE = {"s01": .8, "s02": 1.0, "s03": 1.4, "s04": 2.0, "s05": .8, "s06": .8, "s07": .8, "s08": .9, "s09": 1.0, "s10": 1.2, "s11": 1.2, "s12": 2.5}
INTRO = 1.5
L = {k: decoded(f"{VO}/{k}.mp3") for k in PAUSE}; blk = {k: L[k] + PAUSE[k] for k in PAUSE}
start, t = {}, INTRO
for k in PAUSE: start[k] = t; t += blk[k]
print("starts:", {k: round(v, 2) for k, v in start.items()}, "end:", round(t, 2))

# B1 — Toronto, midnight, snow: the wide penthouse (title on the right) -> her close-up (Kling) -> her real typing on "asking an AI"
b = INTRO + blk["s01"]; clip("V1__hailuo", 4.0); clip("V2__kling", 3.2); split_rec(26.0, 24.0, b - 7.2)
# B2 — the real ChatGPT search -> the real answer (names blurred)
b = blk["s02"]; split_rec(48.0, 8.5, 3.3); split_still("S1_chatgpt_answer", b - 3.3)
# B3 — she writes on WhatsApp (over the real HubSpot list) -> Sunday: the host at sea with another family -> the real Caribbean
# coast (passing days) -> Wednesday on his dock, too late + "las buenas oportunidades se enfrían en silencio"
b = blk["s03"]; split_still("S2_whatsapp", 1.95); clip("V3__hailuo", 2.6); clip("351939", 1.1, start=12.0, qr=True, src=f"{B}/stock/351939_large.mp4", grade="eq=brightness=-0.10:contrast=1.08:saturation=1.15")   # white surf: darker so the caption reads
clip("V4__hailuo", b - 5.65)
# B4 — the thesis
card_png("card_s04.png", blk["s04"])
# B5 — rewind: Wednesday -> Sunday backwards -> her again, same question (card on the right, her face is left)
b = blk["s05"]; reverse("V4__hailuo", 1.1); reverse("V3__hailuo", 1.0); still("k_v2", b - 2.1)
# B6 — the real audit
b = blk["s06"]; split_audit(9.4, 5.4, 2.5); split_audit(15.2, 3.4, 1.9); split_audit(20.0, 90.0, b - 4.4)
# B7 — she writes, the kids lean in -> she hears back (real email) -> the host gets the lead (real Telegram card)
b = blk["s07"]; clip("V6__hailuo", b - 2.6); split_still("S4_gmail_ack", 1.3); split_still("S5_tg_new_inquiry", 1.3)
# B8 — dawn at his dock: one tap -> Send/Edit/Skip -> SENT -> logged in HubSpot
b = blk["s08"]; clip("V7__hailuo", b - 3.9); split_still("S6a_tg_send_edit_skip", 1.3); split_still("S6b_tg_sent", 1.2); split_still("S8_hubspot_activity", 1.4)
# B9 — every morning: HubSpot + who's new / warm / slipping away
split_still("S9_hubspot_deal", blk["s09"], zoom=0.00012)
# B10 — Elena: "charter flight -> boat transfer -> over-water villa": the private plane over Bocas -> the airstrip, the host welcomes
# them -> the boat transfer (drone, ICP card) -> THE PAYOFF on the villa dock, her face
b = blk["s10"]; clip("V13__hailuo", 2.0, qr=True); clip("V14__hailuo", 1.9); clip("V8__hailuo", 3.6, qr=True); clip("V9__kling", b - 7.5, start=1.9)   # from 1.9 s she turns to camera, smiling
# B11 — the villa morning, the reveal as a lower third · B12 — New Year over the bay -> the split end card, big QR
clip("V12__hailuo", blk["s11"])
b = blk["s12"]; clip("V10__kling", 3.0); card_png("card_s12.png", b - 3.0)

pic = f"{OUTD}/picture.mp4"
if not OVERLAY_ONLY:
    lst = f"{OUTD}/list.txt"; open(lst, "w").write("".join(f"file '{p}'\n" for p in segs))
    ff(["-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", pic])

# ---- voice track: lines + pauses, concat FILTER, loudness-normalised ----
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
    if c.get("line"):   # relative to a voice block (ICP card on the drone, the reveal on the villa morning)
        a = start[c["line"]] + c["a"]; z = start[c["line"]] + (c["z"] if c.get("z") is not None else blk[c["line"]] - 0.05)
    else: a, z = c["a"], c["z"]
    items.append((max(0.05, a), z, c))
args, fc, last = ["-i", pic], [], "0:v"
for i, (a, z, c) in enumerate(items, 1):
    args += ["-framerate", str(FPS), "-loop", "1", "-t", f"{z + 0.2:.3f}", "-i", f"{AS}/{c['file']}"]
    fi = min(0.22, (z - a) / 4)
    fc.append(f"[{i}:v]format=rgba,fade=t=in:st={a:.3f}:d={fi:.3f}:alpha=1,fade=t=out:st={z - fi:.3f}:d={fi:.3f}:alpha=1[o{i}];"
              f"[{last}][o{i}]overlay={c['x']}:{c['y']}:eof_action=pass[v{i}]"); last = f"v{i}"
pic_es = f"{OUTD}/picture_es.mp4"
ff(args + ["-filter_complex", ";".join(fc), "-map", f"[{last}]", "-frames:v", str(done)] + ENC + [pic_es])
print(json.dumps({"segments": len(segs), "frames": done, "picture_es_s": round(dur(pic_es), 3), "voice_s": round(dur(voice), 3), "timeline_s": round(t, 3), "overlays": len(items)}))
