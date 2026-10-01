# AI Growth Operator promo - CUT v5 (1 Oct 2026) = v4 + Elena's v4 review: the Biomuseo causeway clip -> the Panama City
# tower flyover (Pixabay 371076, from 14 s); the toast shot G9 OUT (the captain faces the guests from the helm - the same
# wrong-way helm she flagged before); THE PAYOFF G7 holds to the end of the line. Was: CUT v4 (1 Oct 2026). Runs on Oracle in ~/aigo-promo. Assets: aigo-promo-v4-assets.py -> v4/.
# Elena's review of v3.1: captions in brand type (serif + gold italic, no box) · every real screen SPLIT, half screen / half a
# big QR · her ChatGPT recording given real screen time (typing on "she's asking an AI", the search + first answer lines
# on "it suggests the boats" - stops at 56.5 s, the first frame that would show a business name is 57 s) · the real Bocas
# del Toro sunset back at length, and under the reveal · B9 "who's new / warm / slipping away" as English kinetic type ·
# music = DARIOCOIRO "Gold on the Water" with the vocals removed (demucs htdemucs, verified: no voice left).
# Timing = cut3's: decoded voice lengths + one frame clock (picture == voice to the frame).
import json, os, subprocess

B = os.path.expanduser("~/aigo-promo")
W, H, FPS = 1920, 1080, 24
STOCK, VO, V4 = f"{B}/stock", f"{B}/voice/full_mm", f"{B}/v4"
QR = f"{B}/img/brand_qr.png"
C4 = f"{B}/cut5"; SEG = f"{C4}/seg"; os.makedirs(SEG, exist_ok=True)
ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-r", str(FPS), "-an"]
FIT = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1"
REC = f"{B}/captures/elena-phone-20260930-take3/S1_chatgpt_recording.mp4"
AUD = f"{B}/rec/S3_audit_atuona.mp4"
man = json.load(open(f"{V4}/manifest.json", encoding="utf-8")); LAY = man["layout"]
OVERLAY_ONLY = bool(os.environ.get("OVERLAY_ONLY"))
segs = []

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

def clip(name, d, start=0.0, qr=False, src=None):
    # scenic frames without the couple carry the QR, now 300 px with a wider margin (Elena: "QR should appear large")
    n = nframes(d); de = n / FPS
    src = src or f"{B}/clips/{name}.mp4"; sp = max(1.0, de / (dur(src) - start))
    chain = f"[0:v]{FIT},setpts={sp:.4f}*(PTS-STARTPTS),fps={FPS},tpad=stop_mode=clone:stop_duration=1"
    if qr: run_video([["-ss", str(start), "-i", src], loop(QR)], chain + "[b];[1:v]scale=300:300:flags=lanczos[q];[b][q]overlay=W-w-56:H-h-56[v]", n)
    else: run_video([["-ss", str(start), "-i", src]], chain + "[v]", n)

def reverse(name, d, speed=3.0):
    n = nframes(d)
    run_video([["-i", f"{B}/clips/{name}.mp4"]], f"[0:v]{FIT},reverse,setpts=PTS/{speed},fps={FPS},eq=saturation=0.55:contrast=1.1[v]", n)

def still(img, d):
    n = nframes(d)
    run_video([loop(f"{B}/img/{img}.jpg")], f"[0:v]{FIT},scale={W*2}:{H*2},zoompan=z='min(zoom+0.0006,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS}[v]", n)

def split_still(name, d, zoom=0.00022):
    # half screen / half QR, composed as one designed frame; a barely-there push-in keeps it alive and the QR scannable
    n = nframes(d)
    run_video([loop(f"{V4}/split_{name}.png")], f"[0:v]scale={W*2}:{H*2},zoompan=z='min(zoom+{zoom},1.025)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS}[v]", n)

def split_rec(start, srcdur, d):
    n = nframes(d); sp = srcdur / (n / FPS); r = LAY["rec"]
    fc = (f"[0:v]trim=start={start}:duration={srcdur},setpts=(PTS-STARTPTS)/{sp:.4f},fps={FPS},tpad=stop_mode=clone:stop_duration=1,"
          f"crop=iw:ih*0.86:0:ih*0.07,scale={r['w']}:{r['h']},format=rgba[v0];[2:v]format=gray,scale={r['w']}:{r['h']}[m];[v0][m]alphamerge[ph];"
          f"[1:v]fps={FPS}[bg];[bg][ph]overlay={r['x']}:{r['y']}:shortest=1[v]")
    run_video([["-i", REC], loop(f"{V4}/panel_phone.png"), loop(f"{V4}/mask_rec.png")], fc, n)

def split_audit(start, srcdur, d):
    n = nframes(d); sp = srcdur / (n / FPS); a = LAY["audit"]
    fc = (f"[0:v]trim=start={start}:duration={srcdur},setpts=(PTS-STARTPTS)/{sp:.4f},fps={FPS},tpad=stop_mode=clone:stop_duration=1,"
          f"crop=1080:608:400:230,format=rgba[v0];[2:v]format=gray[m];[v0][m]alphamerge[pg];"
          f"[1:v]fps={FPS}[bg];[bg][pg]overlay={a['x']}:{a['y']}:shortest=1[v]")
    run_video([["-i", AUD], loop(f"{V4}/panel_wide.png"), loop(f"{V4}/mask_audit.png")], fc, n)

def card_png(file, d):
    n = nframes(d); de = n / FPS
    run_video([loop(f"{V4}/{file}")], f"[0:v]scale={W*2}:{H*2},zoompan=z='min(zoom+0.0002,1.02)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS},"
              f"fade=t=in:st=0:d=0.4,fade=t=out:st={de-0.4:.3f}:d=0.4[v]", n)

def reveal(d):
    # "the people are AI, the screens are real" over REAL Panama footage - the Bocas del Toro sunset, dimmed for the type
    n = nframes(d); de = n / FPS
    run_video([["-ss", "20", "-i", f"{STOCK}/346372_medium.mp4"], loop(f"{V4}/reveal_s11.png")],
              f"[0:v]{FIT},fps={FPS},lutrgb=r=val*0.62:g=val*0.62:b=val*0.62,vignette=PI/5[b];[b][1:v]overlay=0:0,"
              f"fade=t=in:st=0:d=0.4,fade=t=out:st={de-0.4:.3f}:d=0.4[v]", n)

# ---- voice timeline ----
PAUSE = {"s01": .8, "s02": 1.0, "s03": 1.4, "s04": 2.0, "s05": .8, "s06": .8, "s07": .8, "s08": .9, "s09": 1.0, "s10": 1.2, "s11": 1.2, "s12": 2.5}
INTRO = 1.5
L = {k: decoded(f"{VO}/{k}.mp3") for k in PAUSE}
blk = {k: L[k] + PAUSE[k] for k in PAUSE}
start, t = {}, INTRO
for k in PAUSE: start[k] = t; t += blk[k]

# B0+B1 — midnight; "she's asking an AI" lands on her real typing
b = INTRO + blk["s01"]; clip("G1b__runway", 3.6); clip("G2b__hailuo", 1.7); split_rec(26.0, 24.0, b - 5.3)
# B2 — sent -> "Searching the web" -> the first answer lines (no names before 57 s) -> the answer, names blurred
b = blk["s02"]; split_rec(48.0, 8.5, 3.3); split_still("S1_chatgpt_answer", b - 3.3)
# B3 — Friday at sea (WhatsApp) -> real Panama City towers (drone) -> Monday: she is gone
b = blk["s03"]; split_still("S2_whatsapp", 1.6); clip("G3__runway", 2.5)
clip("371076", 1.6, start=14.0, qr=True, src=f"{STOCK}/371076_medium.mp4"); clip("G4b__hailuo", b - 5.7)
# B4 — the thesis
card_png("card_s04.png", blk["s04"])
# B5 — rewind
b = blk["s05"]; reverse("G4b__hailuo", 1.1); reverse("G3__runway", 1.0); still("k_g2b", b - 2.1)
# B6 — the real audit, split with the QR
b = blk["s06"]; split_audit(9.4, 5.4, 2.5); split_audit(15.2, 3.4, 1.9); split_audit(20.0, 90.0, b - 4.4)
# B7 — she writes -> she hears back -> the owner's phone gets the lead
b = blk["s07"]; clip("G5b__hailuo", b - 2.6); split_still("S4_gmail_ack", 1.3); split_still("S5_tg_new_inquiry", 1.3)
# B8 — the human yes -> Send/Edit/Skip -> SENT -> logged in HubSpot
b = blk["s08"]; clip("G6c__hailuo", b - 3.9); split_still("S6a_tg_send_edit_skip", 1.3); split_still("S6b_tg_sent", 1.2)
split_still("S8_hubspot_activity", 1.4)
# B9 — every morning: HubSpot + the English kinetic words (overlay pass)
split_still("S9_hubspot_deal", blk["s09"], zoom=0.00012)
# B10 — the real sunset -> Guna Yala -> THE PAYOFF (from 1.7 s, ends on her face) -> the toast, re-shot as G9b: the captain
# steers in side profile, eyes ahead (Elena: "the scene is super, but the captain should drive correctly"); first 2.5 s only -
# after that the camera drifts behind the women and her face turns away
b = blk["s10"]; clip("346372", 2.8, start=8.0, qr=True, src=f"{STOCK}/346372_medium.mp4")
clip("G8b__runway", 1.6, qr=True); clip("G7b__hailuo", 3.3, start=1.6); clip("G9c__hailuo", b - 7.7)
# v7 (Elena, 1 Oct): on the yacht she wears her yacht look - emerald silk (wardrobe B, ref v_r1_yacht), not the apartment wrap.
# G7b from 1.6 s = step aboard -> his hand -> the smile; G9c first 2.5 s only - a made-up "X" logo appears on the hull from ~4.5 s.
# B11 — the reveal over the real sunset · B12 — split end card, big QR
reveal(blk["s11"]); card_png("card_s12.png", blk["s12"])

pic = f"{C4}/picture.mp4"
if not OVERLAY_ONLY:
    lst = f"{C4}/list.txt"; open(lst, "w").write("".join(f"file '{p}'\n" for p in segs))
    ff(["-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", pic])

# ---- overlay pass: scrims, captions, titles, kinetic words - each fading on the voice's own clock ----
items = []
for k in sorted({c["line"] for c in man["captions"]}):
    items.append((start[k] - 0.1, start[k] + L[k] + 0.35, man["scrim"]))
for c in man["captions"]:
    items.append((start[c["line"]] + c["t0"], min(start[c["line"]] + c["t1"], start[c["line"]] + L[c["line"]] + 0.25), c))
for c in man["titles"]:
    items.append((start[c["line"]] + c["t0"], start[c["line"]] + (c["t1"] if c["t1"] is not None else blk[c["line"]]), c))
for c in man["kinetic"]:
    items.append((start[c["line"]] + c["t0"], start[c["line"]] + blk[c["line"]] - 0.05, c))
for c in man.get("absolute", []):          # timed to the film clock, not to a voice line (the opening title, the ICP card)
    items.append((c["a"], c["z"], c))
args, fc, last = ["-i", pic], [], "0:v"
for i, (a, z, c) in enumerate(items, 1):
    args += ["-framerate", str(FPS), "-loop", "1", "-t", f"{z + 0.2:.3f}", "-i", f"{V4}/{c['file']}"]
    fi = min(0.22, (z - a) / 4)
    fc.append(f"[{i}:v]format=rgba,fade=t=in:st={a:.3f}:d={fi:.3f}:alpha=1,fade=t=out:st={z - fi:.3f}:d={fi:.3f}:alpha=1[o{i}];"
              f"[{last}][o{i}]overlay={c['x']}:{c['y']}:eof_action=pass[v{i}]")
    last = f"v{i}"
pic_es = f"{C4}/picture_es.mp4"
ff(args + ["-filter_complex", ";".join(fc), "-map", f"[{last}]", "-frames:v", str(done)] + ENC + [pic_es])
print(json.dumps({"segments": len(segs), "frames": done, "picture_es_s": round(dur(pic_es), 3), "voice_timeline_s": round(t, 3), "overlays": len(items)}))
