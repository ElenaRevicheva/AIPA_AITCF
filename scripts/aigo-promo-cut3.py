# AI Growth Operator promo - CUT v3 (30 Sep 2026). Runs on Oracle in ~/aigo-promo.
# From cut v2, Elena's review: (1) text restyled to the aideazz.xyz/api + HubSpot look and put in SPANISH - the cards are
# PNGs rendered by aigo-promo-es-assets.py, captions + titles are overlaid in one pass timed to the voice; (2) the 8 AM
# brief placeholder is replaced by a real HubSpot deal screen ("do not wait for Telegram, use HubSpot"); (3) music = her
# pick #1 (BerryDeep "Tropical House", Pixabay, not Content ID registered, Gemini-checked: no vocals), mixed by
# aigo-promo-music-mix.py.
# Timing fix vs v2: blocks are measured from the DECODED voice files (what the audio concat actually plays), not from
# ffprobe's container duration, which counts mp3 encoder padding (~0.05 s a file) - v2's picture ran 0.6 s long and the
# end card drifted behind the voice. Every segment is also cut to an exact frame count against one running clock.
import json, os, subprocess

B = os.path.expanduser("~/aigo-promo")
W, H, FPS = 1920, 1080, 24
SAFE, STOCK, VO, ES = f"{B}/captures/safe", f"{B}/stock", f"{B}/voice/full_mm", f"{B}/es"
QR = f"{B}/img/brand_qr.png"
C3 = f"{B}/cut3"; SEG = f"{C3}/seg"; os.makedirs(SEG, exist_ok=True)
ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-r", str(FPS), "-an"]
FIT = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1"
segs = []

def ff(args): subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-nostdin"] + args, check=True)
def dur(p): return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout)
def decoded(p):
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-f", "s16le", "-ac", "1", "-ar", "44100", "-"], capture_output=True).stdout
    return len(pcm) / 2 / 44100
def out(): p = f"{SEG}/s{len(segs):02d}.mp4"; segs.append(p); return p

clock, done = 0.0, 0
def nframes(d):
    # one running clock: each segment gets exactly the frames that bring the picture to the voice's time
    global clock, done
    clock += d; n = round(clock * FPS) - done; done += n; return n

OVERLAY_ONLY = bool(os.environ.get("OVERLAY_ONLY"))   # text changed only: keep the built segments, redo the overlay pass
def run_video(inputs, fc, n):
    if OVERLAY_ONLY: segs.append(None); return
    args = []
    for i in inputs: args += i
    ff(args + ["-filter_complex", fc, "-map", "[v]", "-frames:v", str(n)] + ENC + [out()])
QRIN = ["-loop", "1", "-i", QR]
QRO = "[1:v]scale=250:250:flags=lanczos[q];[b][q]overlay=W-w-44:H-h-44[v]"

def clip(name, d, start=0.0, qr=False, src=None):
    n = nframes(d); de = n / FPS
    src = src or f"{B}/clips/{name}.mp4"; sp = max(1.0, de / (dur(src) - start))       # slow down to fill, never speed up
    chain = f"[0:v]{FIT},setpts={sp:.4f}*(PTS-STARTPTS),fps={FPS},tpad=stop_mode=clone:stop_duration=1"
    run_video([["-ss", str(start), "-i", src]] + ([QRIN] if qr else []), chain + ("[b];" + QRO if qr else "[v]"), n)

def reverse(name, d, speed=3.0):
    n = nframes(d)
    run_video([["-i", f"{B}/clips/{name}.mp4"]], f"[0:v]{FIT},reverse,setpts=PTS/{speed},fps={FPS},eq=saturation=0.55:contrast=1.1[v]", n)

def still(img, d):
    n = nframes(d)
    run_video([["-loop", "1", "-i", f"{B}/img/{img}.jpg"]],
              f"[0:v]{FIT},scale={W*2}:{H*2},zoompan=z='min(zoom+0.0006,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS}[v]", n)

def phone_still(file, d, zoom=0.0008):
    n = nframes(d)
    fc = (f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=30:3,eq=brightness=-0.28[bg];"
          f"[0:v]scale=-2:'min({int(H*0.9)},ih*{W*0.62}/iw*1.0)'[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,"
          f"scale={W*2}:{H*2},zoompan=z='min(zoom+{zoom},1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS}[b];" + QRO)
    run_video([["-loop", "1", "-i", f"{SAFE}/{file}"], QRIN], fc, n)

def phone_video(src, start, srcdur, d):
    n = nframes(d); sp = srcdur / (n / FPS)
    fc = (f"[0:v]trim=start={start}:duration={srcdur},setpts=(PTS-STARTPTS)/{sp:.4f},fps={FPS},tpad=stop_mode=clone:stop_duration=1,split[a][c];"
          f"[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=30:3,eq=brightness=-0.28[bg];"
          f"[c]crop=iw:ih*0.86:0:ih*0.07,scale=-2:{int(H*0.92)}[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[b];" + QRO)
    run_video([["-i", src], QRIN], fc, n)

def audit(src, start, srcdur, d):
    n = nframes(d); sp = srcdur / (n / FPS)
    fc = (f"[0:v]trim=start={start}:duration={srcdur},setpts=(PTS-STARTPTS)/{sp:.4f},fps={FPS},tpad=stop_mode=clone:stop_duration=1,"
          f"crop=1080:608:400:230,scale={W}:{H}:flags=lanczos,setsar=1[b];" + QRO)
    run_video([["-i", src], QRIN], fc, n)

def card_png(file, d):
    # the Spanish card (QR already baked in), a barely-there push-in and soft fades - a designed frame, not a slide
    n = nframes(d); de = n / FPS
    run_video([["-loop", "1", "-i", f"{ES}/{file}"]],
              f"[0:v]scale={W*2}:{H*2},zoompan=z='min(zoom+0.00025,1.025)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS},"
              f"fade=t=in:st=0:d=0.4,fade=t=out:st={de-0.4:.3f}:d=0.4[v]", n)

# ---- the voice timeline: decoded line lengths + the same breathing pauses as cut v2 ----
PAUSE = {"s01": .8, "s02": 1.0, "s03": 1.4, "s04": 2.0, "s05": .8, "s06": .8, "s07": .8, "s08": .9, "s09": 1.0, "s10": 1.2, "s11": 1.2, "s12": 2.5}
INTRO = 1.5
L = {k: decoded(f"{VO}/{k}.mp3") for k in PAUSE}
blk = {k: L[k] + PAUSE[k] for k in PAUSE}
start, t = {}, INTRO
for k in PAUSE: start[k] = t; t += blk[k]
print("blocks:", {k: round(v, 3) for k, v in blk.items()}, "voice end:", round(t, 3))

# B0+B1 — midnight, Tribeca
b = INTRO + blk["s01"]; clip("G1b__runway", 3.6); clip("G2b__hailuo", b - 3.6)
# B2 — she asks ChatGPT (real recording, private first 13 s never used) -> the real answer, names blurred
rec = f"{B}/captures/elena-phone-20260930-take3/S1_chatgpt_recording.mp4"
b = blk["s02"]; phone_video(rec, 27.0, 26.0, 3.6); phone_still("safe_S1_chatgpt_answer.jpg", b - 3.6, zoom=0.0012)
# B3 — Friday at sea (WhatsApp) -> real Panama City causeway -> Monday: she is gone
b = blk["s03"]; phone_still("safe_S2_whatsapp.jpg", 1.6); clip("G3__runway", 2.5)
clip("34734", 1.6, start=4.0, qr=True, src=f"{STOCK}/34734-403432565_medium.mp4"); clip("G4b__hailuo", b - 5.7)
# B4 — the thesis (Spanish card)
card_png("card_s04.png", blk["s04"])
# B5 — rewind
b = blk["s05"]; reverse("G4b__hailuo", 1.1); reverse("G3__runway", 1.0); still("k_g2b", b - 2.1)
# B6 — the real audit
aud = f"{B}/rec/S3_audit_atuona.mp4"
b = blk["s06"]; audit(aud, 9.4, 5.4, 2.5); audit(aud, 15.2, 3.4, 1.9); audit(aud, 20.0, 90.0, b - 4.4)
# B7 — she writes -> she hears back (real email) -> the owner's phone gets the lead (real Telegram card)
b = blk["s07"]; clip("G5b__hailuo", b - 2.6); phone_still("safe_S4_gmail_ack.jpg", 1.3); phone_still("safe_S5_tg_new_inquiry.jpg", 1.3)
# B8 — the human yes: helm -> Send/Edit/Skip -> SENT -> logged in HubSpot
b = blk["s08"]; clip("G6c__hailuo", b - 3.9); phone_still("safe_S6a_tg_send_edit_skip.jpg", 1.3)
phone_still("safe_S6b_tg_sent.jpg", 1.2); phone_still("safe_S8_hubspot_activity.jpg", 1.4)
# B9 — every morning: the real HubSpot deal (stage, next activity, recent activity) — Elena: "use HubSpot"
phone_still("safe_S9_hubspot_deal.jpg", blk["s09"], zoom=0.0005)
# B10 — arrival: real Bocas del Toro sunset -> Guna Yala drone -> THE PAYOFF -> the life
b = blk["s10"]; clip("346372", 1.8, start=8.0, qr=True, src=f"{STOCK}/346372_medium.mp4")
clip("G8b__runway", 2.6, qr=True); clip("G7__venice", 3.8); clip("G9__venice", b - 8.2)
# B11 — the reveal · B12 — end card (Spanish cards)
card_png("card_s11.png", blk["s11"]); card_png("card_s12.png", blk["s12"])

pic = f"{C3}/picture.mp4"
if not OVERLAY_ONLY:
    lst = f"{C3}/list.txt"; open(lst, "w").write("".join(f"file '{p}'\n" for p in segs))
    ff(["-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", pic])

# ---- Spanish captions + titles, one pass, each fading in/out on the voice's own clock ----
man = json.load(open(f"{ES}/manifest.json", encoding="utf-8"))
items = []
for c in man["captions"]:
    a = start[c["line"]] + c["t0"]; z = min(start[c["line"]] + c["t1"], start[c["line"]] + L[c["line"]] + 0.25)
    items.append((a, z, c))
for c in man["titles"]:
    a = start[c["line"]] + c["t0"]; z = start[c["line"]] + (c["t1"] if c["t1"] is not None else blk[c["line"]])
    items.append((a, z, c))
args, fc, last = ["-i", pic], [], "0:v"
for i, (a, z, c) in enumerate(items, 1):
    args += ["-framerate", str(FPS), "-loop", "1", "-t", f"{z + 0.2:.3f}", "-i", f"{ES}/{c['file']}"]
    fi = min(0.18, (z - a) / 4)
    fc.append(f"[{i}:v]format=rgba,fade=t=in:st={a:.3f}:d={fi:.3f}:alpha=1,fade=t=out:st={z - fi:.3f}:d={fi:.3f}:alpha=1[o{i}];"
              f"[{last}][o{i}]overlay={c['x']}:{c['y']}:eof_action=pass[v{i}]")
    last = f"v{i}"
pic_es = f"{C3}/picture_es.mp4"
ff(args + ["-filter_complex", ";".join(fc), "-map", f"[{last}]", "-frames:v", str(done)] + ENC + [pic_es])
print(json.dumps({"segments": len(segs), "frames": done, "picture_s": round(dur(pic), 3), "picture_es_s": round(dur(pic_es), 3),
                  "voice_timeline_s": round(t, 3), "overlays": len(items), "file": pic_es}))
