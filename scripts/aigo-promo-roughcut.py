# AI Growth Operator promo - ROUGH ASSEMBLY (review cut for Elena, 30 Sep 2026). Runs on Oracle in ~/aigo-promo.
# Picture laid to the recorded narration (voice/full_verse/narration_verse_full.mp3, 104.4 s): each block = one narration
# line + its pause. Real screens not captured yet appear as labelled placeholders. No music yet (Pixabay shortlist next).
# Text is drawn from files (textfile=) so apostrophes/colons never need ffmpeg escaping.
import os, subprocess, json

B = os.path.expanduser("~/aigo-promo")
W, H, FPS = 1920, 1080, 24
SERIF = os.path.expanduser("~/aideazz-api-film-v19/fonts/InstrumentSerif-Regular.ttf")
SANS = os.path.expanduser("~/aideazz-api-film-v19/fonts/Manrope-var.ttf")
CAP = os.path.join(B, "captures/elena-phone-20260930-take2")
SEG = os.path.join(B, "rough/seg"); os.makedirs(SEG, exist_ok=True)
ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(FPS), "-an"]
segs = []

def ff(args): subprocess.run(["ffmpeg", "-y", "-loglevel", "error"] + args, check=True)
def dur(p): return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout)
def tf(text):
    p = os.path.join(SEG, f"t{len(os.listdir(SEG))}.txt"); open(p, "w").write(text); return p
def txt(text, size=64, y="h-th-120", font=SERIF, color="white"):
    return f"drawtext=fontfile={font}:textfile={tf(text)}:fontsize={size}:fontcolor={color}:x=(w-tw)/2:y={y}:shadowcolor=black@0.6:shadowx=2:shadowy=2"
def out(): p = os.path.join(SEG, f"s{len(segs):02d}.mp4"); segs.append(p); return p
FIT = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1"

def clip(name, d, start=0.0, text=None, text_from=0.0):
    src = os.path.join(B, "clips", name + ".mp4"); avail = dur(src) - start
    speed = max(1.0, d / avail)                      # slow down (never speed up) to fill the block
    vf = f"{FIT},setpts={speed:.4f}*(PTS-STARTPTS),fps={FPS},trim=duration={d}"
    if text: vf += "," + txt(text).replace("drawtext=", f"drawtext=enable='gte(t,{text_from})':", 1)
    ff(["-ss", str(start), "-i", src, "-vf", vf, "-t", str(d)] + ENC + [out()])

def reverse(name, d, speed=3.0):
    src = os.path.join(B, "clips", name + ".mp4")
    ff(["-i", src, "-vf", f"{FIT},reverse,setpts=PTS/{speed},fps={FPS},trim=duration={d},eq=saturation=0.6:contrast=1.1", "-t", str(d)] + ENC + [out()])

def still(img, d, text=None):
    src = os.path.join(B, "img", img + ".jpg"); n = int(d * FPS)
    vf = f"{FIT},scale={W*2}:{H*2},zoompan=z='min(zoom+0.0006,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS}"
    if text: vf += "," + txt(text)
    ff(["-loop", "1", "-i", src, "-vf", vf, "-frames:v", str(n)] + ENC + [out()])

def phone(file, d):
    # a real phone screenshot, never a slide: full-bleed blurred copy behind, the screen itself sharp, slow push-in
    src = os.path.join(CAP, file); n = int(d * FPS)
    fc = (f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=30:3,eq=brightness=-0.25[bg];"
          f"[0:v]scale=-2:{int(H*0.92)}[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,"
          f"scale={W*2}:{H*2},zoompan=z='min(zoom+0.0008,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS}[v]")
    ff(["-loop", "1", "-i", src, "-filter_complex", fc, "-map", "[v]", "-frames:v", str(n)] + ENC + [out()])

def card(lines, d, label=False):
    vf = []
    y0 = H/2 - (len(lines) - 1) * 50
    for i, (t, size, font, color) in enumerate(lines):
        vf.append(txt(t, size=size, y=f"{y0 + i*100}-th/2", font=font, color=color))
    fade = f",fade=t=in:st=0:d=0.4,fade=t=out:st={d-0.4}:d=0.4"
    ff(["-f", "lavfi", "-i", f"color=c=0x0b0b0d:s={W}x{H}:r={FPS}:d={d}", "-vf", ",".join(vf) + fade] + ENC + [out()])

def placeholder(what, d):
    card([("REAL SCREEN — to capture", 34, SANS, "0xE6C88A"), (what, 52, SERIF, "white")], d)

GOLD, WHITE = "0xE6C88A", "white"
# L1 8.6 s — midnight, New York
clip("G1__runway", 3.0)                                   # first 3 s only: Runway invents a different woman after ~3.5 s
clip("G2__venice", 5.6)
# L2 9.2 s — the AI answer
placeholder("An AI assistant answering: best private catamaran charter, San Blas (names blurred)", 9.2)
# L3 10.8 s — Friday at sea -> Monday
placeholder("WhatsApp: Hi! Is your catamaran free March 12–17? We're 6.", 1.4)
clip("G3__runway", 4.6)
clip("G4__venice", 4.8, text="GOOD OPPORTUNITIES QUIETLY AGE OUT.", text_from=1.8)
# L4 6.2 s — the thesis
card([("Nobody wakes up wanting AI.", 78, SERIF, WHITE), ("You want more bookings.", 60, SERIF, GOLD)], 6.2)
# L5 7.3 s — rewind
reverse("G4__venice", 1.2); reverse("G3__runway", 1.1)
still("k_g2", 5.0, text="SAME GUEST. SAME QUESTION.")
# L6 9.9 s — the audit
placeholder("aideazz.xyz/api — live audit, 34 checks, score, fixes (clean new recording)", 9.9)
# L7 7.4 s — she writes, she hears back, the draft
clip("G5__venice", 4.8)
phone("01_gmail_we_received_your_inquiry.jpg", 1.3)
phone("02_tg_new_inquiry_card.jpg", 1.3)
# L8 9.0 s — the human yes
clip("G6__venice", 4.8)
phone("03_tg_draft_openai_100_casestudies_line.jpg", 1.4)
phone("04_tg_send_edit_skip_buttons.jpg", 1.4)
phone("05_tg_edited_version_SENT.jpg", 1.4)
# L9 7.8 s — the morning brief
placeholder("Telegram 8 AM brief — NEW / ACTIVE / AGING (names blurred)", 7.8)
# L10 12.3 s — arrival, THE PAYOFF, the life
clip("G8__runway", 3.5)
clip("G7__venice", 5.0)
clip("G9__venice", 3.8)
# L11 6.2 s — the reveal
clip("G9__venice", 1.2, start=3.8)
card([("AIdeazz AI Lab", 70, SERIF, WHITE), ("MADE IN OUR OWN AI FILM STUDIO", 34, SANS, GOLD)], 5.0)
# L12 9.8 s — end card
card([("AI GROWTH OPERATOR", 84, SERIF, WHITE), ("by AIdeazz AI Lab", 40, SANS, GOLD),
      ("FREE AI VISIBILITY AUDIT", 44, SANS, WHITE), ("aideazz.xyz/api", 64, SERIF, GOLD),
      ("Dramatization: people generated with AI", 26, SANS, "0x9a9a9a")], 9.8)

lst = os.path.join(B, "rough/list.txt"); open(lst, "w").write("".join(f"file '{p}'\n" for p in segs))
silent = os.path.join(B, "rough/picture.mp4")
ff(["-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", silent])
final = os.path.join(B, "rough/AIGO_rough_cut_v1.mp4")
ff(["-i", silent, "-i", os.path.join(B, "voice/full_verse/narration_verse_full.mp3"), "-map", "0:v", "-map", "1:a",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", final])
print(json.dumps({"segments": len(segs), "picture_s": round(dur(silent), 2), "final_s": round(dur(final), 2), "file": final}))
