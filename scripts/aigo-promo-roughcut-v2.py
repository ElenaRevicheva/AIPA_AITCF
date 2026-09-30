# AI Growth Operator promo - CUT v2 (30 Sep 2026). Runs on Oracle in ~/aigo-promo.
# Elena's review applied: phone not laptop, real ChatGPT answer, Panama City skyline + real Panama stock (Pixabay, verified
# Panamanian by her), Guna Yala drone, correct helm, WhatsApp guest / Telegram owner, HubSpot, QR (-> aideazz.xyz/api) on
# every frame without the couple, logo on the final cards, narration = MiniMax "magnetic" (her pick #5), per-line files with
# breathing pauses. Every real screen comes from captures/safe/ (private text blurred or cropped, checked by eye).
import os, subprocess, json

B = os.path.expanduser("~/aigo-promo")
W, H, FPS = 1920, 1080, 24
SERIF = os.path.expanduser("~/aideazz-api-film-v19/fonts/InstrumentSerif-Regular.ttf")
SANS = os.path.expanduser("~/aideazz-api-film-v19/fonts/Manrope-var.ttf")
SAFE, STOCK, VO = f"{B}/captures/safe", f"{B}/stock", f"{B}/voice/full_mm"
QR, LOGO = f"{B}/img/brand_qr.png", f"{B}/img/brand_logo.png"
SEG = f"{B}/cut2/seg"; os.makedirs(SEG, exist_ok=True)
ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-r", str(FPS), "-an"]
FIT = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1"
segs = []
GOLD, WHITE = "0xE6C88A", "white"

def ff(args): subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-nostdin"] + args, check=True)
def dur(p): return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout)
def out(): p = f"{SEG}/s{len(segs):02d}.mp4"; segs.append(p); return p
def tf(text): p = f"{SEG}/t{len(os.listdir(SEG))}.txt"; open(p, "w").write(text); return p
def txt(text, size=64, y="h-th-120", font=SERIF, color="white", start=None):
    en = f"enable='gte(t,{start})':" if start is not None else ""
    return (f"drawtext={en}fontfile={font}:textfile={tf(text)}:fontsize={size}:fontcolor={color}:x=(w-tw)/2:y={y}"
            ":shadowcolor=black@0.6:shadowx=2:shadowy=2")

# QR overlay = the brand QR on its own white field, bottom-right (scannable: >= 250 px, 40 px margin)
def with_qr(vf_chain, size=250):
    return (f"[0:v]{vf_chain}[b];[1:v]scale={size}:{size}:flags=lanczos[q];[b][q]overlay=W-w-44:H-h-44[v]")

def run_video(inputs, fc, d, qr=False, qr_size=250):
    args = []
    for i in inputs: args += i
    if qr: args += ["-loop", "1", "-i", QR]
    maps = ["-filter_complex", fc, "-map", "[v]"]
    ff(args + maps + ["-t", str(d)] + ENC + [out()])

def clip(name, d, start=0.0, text=None, text_from=0.0, qr=False, src=None, speed=None):
    src = src or f"{B}/clips/{name}.mp4"; avail = dur(src) - start
    sp = speed if speed else max(1.0, d / avail)                # slow down to fill (never speed up) unless told
    chain = f"{FIT},setpts={1/sp if speed else sp:.4f}*(PTS-STARTPTS),fps={FPS},trim=duration={d}"
    if speed: chain = f"{FIT},setpts=PTS/{speed},fps={FPS},trim=duration={d}"
    if text: chain += "," + txt(text, start=text_from)
    if qr: run_video([["-ss", str(start), "-i", src]], with_qr(chain), d, qr=True)
    else: run_video([["-ss", str(start), "-i", src]], f"[0:v]{chain}[v]", d)

def reverse(name, d, speed=3.0):
    src = f"{B}/clips/{name}.mp4"
    run_video([["-i", src]], f"[0:v]{FIT},reverse,setpts=PTS/{speed},fps={FPS},trim=duration={d},eq=saturation=0.55:contrast=1.1[v]", d)

def still(img, d, text=None):
    n = int(d * FPS)
    chain = f"{FIT},scale={W*2}:{H*2},zoompan=z='min(zoom+0.0006,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS}"
    if text: chain += "," + txt(text)
    run_video([["-loop", "1", "-i", f"{B}/img/{img}.jpg"]], f"[0:v]{chain}[v]", d)

def phone_still(file, d, zoom=0.0008):
    # a real phone screen, never a slide: blurred full-bleed copy behind, the screen sharp, slow push-in, QR bottom-right
    n = int(d * FPS)
    fc = (f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=30:3,eq=brightness=-0.28[bg];"
          f"[0:v]scale=-2:'min({int(H*0.9)},ih*{W*0.62}/iw*1.0)'[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,"
          f"scale={W*2}:{H*2},zoompan=z='min(zoom+{zoom},1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS}[b];"
          f"[1:v]scale=250:250:flags=lanczos[q];[b][q]overlay=W-w-44:H-h-44[v]")
    run_video([["-loop", "1", "-i", f"{SAFE}/{file}"]], fc, d, qr=True)

def phone_video(src, start, srcdur, d):
    sp = srcdur / d
    fc = (f"[0:v]trim=start={start}:duration={srcdur},setpts=(PTS-STARTPTS)/{sp:.4f},fps={FPS},split[a][c];"
          f"[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=30:3,eq=brightness=-0.28[bg];"
          f"[c]crop=iw:ih*0.86:0:ih*0.07,scale=-2:{int(H*0.92)}[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[b];"
          f"[1:v]scale=250:250:flags=lanczos[q];[b][q]overlay=W-w-44:H-h-44[v]")
    run_video([["-i", src]], fc, d, qr=True)

def audit(src, start, srcdur, d):
    sp = srcdur / d        # zoom into the page's centre column (also crops the chat pop-up on the right)
    fc = (f"[0:v]trim=start={start}:duration={srcdur},setpts=(PTS-STARTPTS)/{sp:.4f},fps={FPS},crop=1080:608:400:230,"
          f"scale={W}:{H}:flags=lanczos,setsar=1[b];[1:v]scale=250:250:flags=lanczos[q];[b][q]overlay=W-w-44:H-h-44[v]")
    run_video([["-i", src]], fc, d, qr=True)

def card(lines, d, logo=None, qr_size=260, qr=True):
    # lines: (text, size, font, color, y_px)
    chain = ["[0:v]null"]
    fc = f"[0:v]" + ",".join(txt(t, size=s, y=str(y), font=f, color=c) for t, s, f, c, y in lines) + \
         f",fade=t=in:st=0:d=0.4,fade=t=out:st={d-0.4}:d=0.4[t]"
    inputs = [["-f", "lavfi", "-i", f"color=c=0x0b0b0d:s={W}x{H}:r={FPS}:d={d}"]]
    last = "t"
    if logo:
        lw, ly = logo
        inputs.append(["-loop", "1", "-i", LOGO])
        fc += f";[1:v]scale={lw}:-1,format=rgba[lg];[{last}][lg]overlay=(W-w)/2:{ly}:shortest=1[t2]"; last = "t2"
    if qr:
        qi = len(inputs)
        inputs.append(["-loop", "1", "-i", QR])
        fc += f";[{qi}:v]scale={qr_size}:{qr_size}:flags=lanczos[q];[{last}][q]overlay=W-w-60:H-h-60[v]"
    else:
        fc += f";[{last}]null[v]"
    args = []
    for i in inputs: args += i
    ff(args + ["-filter_complex", fc, "-map", "[v]", "-t", str(d)] + ENC + [out()])

def placeholder(what, d):
    card([("REAL SCREEN — to capture", 34, SANS, GOLD, 440), (what, 50, SERIF, WHITE, 520)], d)

# ---- narration: per-line MiniMax files + breathing pauses (block = line + pause after it) ----
PAUSE = {"s01": .8, "s02": 1.0, "s03": 1.4, "s04": 2.0, "s05": .8, "s06": .8, "s07": .8, "s08": .9, "s09": 1.0, "s10": 1.2, "s11": 1.2, "s12": 2.5}
INTRO = 1.5
blk = {k: round(dur(f"{VO}/{k}.mp3") + PAUSE[k], 2) for k in PAUSE}
print("blocks:", blk)

# B0+B1 — midnight, Tribeca: the establishing window, then meet her on the phone
b = INTRO + blk["s01"]; clip("G1b__runway", 3.6); clip("G2b__hailuo", round(b - 3.6, 2))
# B2 — she asks ChatGPT (real screen recording, private first 13 s never used) -> the real answer, names blurred
rec = f"{B}/captures/elena-phone-20260930-take3/S1_chatgpt_recording.mp4"
b = blk["s02"]; phone_video(rec, 27.0, 26.0, 3.6); phone_still("safe_S1_chatgpt_answer.jpg", round(b - 3.6, 2), zoom=0.0012)
# B3 — Friday at sea (WhatsApp) -> real Panama City causeway -> Monday: she is gone
b = blk["s03"]; phone_still("safe_S2_whatsapp.jpg", 1.6); clip("G3__runway", 2.5)
clip("34734-403432565_medium", 1.6, start=4.0, qr=True, src=f"{STOCK}/34734-403432565_medium.mp4")
clip("G4b__hailuo", round(b - 5.7, 2), text="GOOD OPPORTUNITIES QUIETLY AGE OUT.", text_from=0.4)
# B4 — the thesis
card([("Nobody wakes up wanting AI.", 80, SERIF, WHITE, 470), ("You want more bookings.", 58, SERIF, GOLD, 580)], blk["s04"])
# B5 — rewind
b = blk["s05"]; reverse("G4b__hailuo", 1.1); reverse("G3__runway", 1.0); still("k_g2b", round(b - 2.1, 2), text="SAME GUEST. SAME QUESTION.")
# B6 — the real audit (zoomed centre column): typing -> 93 -> engines, categories, fixes
aud = f"{B}/rec/S3_audit_atuona.mp4"
b = blk["s06"]; audit(aud, 9.4, 5.4, 2.5); audit(aud, 15.2, 3.4, 1.9); audit(aud, 20.0, 90.0, round(b - 4.4, 2))
# B7 — she writes (phone) -> she hears back (real email) -> the owner's phone gets the lead (real Telegram card)
b = blk["s07"]; clip("G5b__hailuo", round(b - 2.6, 2)); phone_still("safe_S4_gmail_ack.jpg", 1.3); phone_still("safe_S5_tg_new_inquiry.jpg", 1.3)
# B8 — the human yes: dawn at the helm -> Send/Edit/Skip -> SENT -> logged in HubSpot
b = blk["s08"]; clip("G6c__hailuo", round(b - 3.9, 2)); phone_still("safe_S6a_tg_send_edit_skip.jpg", 1.3)
phone_still("safe_S6b_tg_sent.jpg", 1.2); phone_still("safe_S8_hubspot_activity.jpg", 1.4)
# B9 — the morning brief (Elena sends tomorrow's 8 AM screenshot)
placeholder("Telegram 8 AM brief — NEW / ACTIVE / AGING (Elena sends tomorrow)", blk["s09"])
# B10 — arrival: real Bocas del Toro sunset -> Guna Yala drone -> THE PAYOFF -> the life
b = blk["s10"]; clip("346372_medium", 1.8, start=8.0, qr=True, src=f"{STOCK}/346372_medium.mp4")
clip("G8b__runway", 2.6, qr=True); clip("G7__venice", 3.8); clip("G9__venice", round(b - 8.2, 2))
# B11 — the reveal
card([("The people in this film are AI.", 56, SERIF, WHITE, 610), ("The product screens are real.", 56, SERIF, GOLD, 690),
      ("MADE IN OUR OWN AI FILM STUDIO", 30, SANS, "0xb8b8b8", 800)], blk["s11"], logo=(760, 250))
# B12 — end card
card([("AI GROWTH OPERATOR", 86, SERIF, WHITE, 520), ("by AIdeazz AI Lab", 38, SANS, GOLD, 630),
      ("FREE AI VISIBILITY AUDIT", 44, SANS, WHITE, 740), ("aideazz.xyz/api", 70, SERIF, GOLD, 815),
      ("Dramatization: people generated with AI", 24, SANS, "0x8a8a8a", 1000)], blk["s12"], logo=(820, 150), qr_size=330)

# ---- picture + narration ----
lst = f"{B}/cut2/list.txt"; open(lst, "w").write("".join(f"file '{p}'\n" for p in segs))
pic = f"{B}/cut2/picture.mp4"; ff(["-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", pic])
parts = [f"{B}/cut2/_intro.mp3"]
ff(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(INTRO), "-c:a", "libmp3lame", "-b:a", "160k", parts[0]])
for k, p in PAUSE.items():
    parts.append(f"{VO}/{k}.mp3"); gap = f"{B}/cut2/_gap_{k}.mp3"
    ff(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(p), "-c:a", "libmp3lame", "-b:a", "160k", gap]); parts.append(gap)
alst = f"{B}/cut2/alist.txt"; open(alst, "w").write("".join(f"file '{p}'\n" for p in parts))
voice = f"{B}/cut2/voice.m4a"
ff(["-f", "concat", "-safe", "0", "-i", alst, "-ar", "44100", "-ac", "2", "-af", "loudnorm=I=-16:TP=-1.5:LRA=7", "-c:a", "aac", "-b:a", "192k", voice])
final = f"{B}/cut2/AIGO_cut_v2.mp4"
ff(["-i", pic, "-i", voice, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "copy", "-shortest", final])
print(json.dumps({"segments": len(segs), "picture_s": round(dur(pic), 2), "voice_s": round(dur(voice), 2), "final_s": round(dur(final), 2), "file": final}))
