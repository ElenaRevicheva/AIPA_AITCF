# FINAL narration in Elena's pick (30 Sep): MiniMax Speech 2.8 HD, voice "English_magnetic_voiced_man" (sample #5 of the
# lineup). Locked text, verbatim (script file 🔒 FINAL). One file per line + the same pauses as the verse take. $0.10/1k tokens.
import base64, json, os, subprocess, time, urllib.request
ENV = os.path.expanduser("~/cto-aipa/.env")
env = lambda n: [l.split("=", 1)[1].strip().strip('"') for l in open(ENV) if l.startswith(n + "=")][0]
REP, GEM = env("REPLICATE_API_TOKEN"), env("GEMINI_API_KEY")
OUT = os.path.expanduser("~/aigo-promo/voice/full_mm"); os.makedirs(OUT, exist_ok=True)
VOICE = "English_magnetic_voiced_man"
LINES = [
 ("s01", "Your next charter guest is planning at midnight. She isn't calling you. She's asking an AI.", ["midnight", "asking an ai"], 0.6),
 ("s02", "It suggests the boats it can understand. If it can't understand your website, you may not make the list.", ["boats", "make the list"], 0.8),
 ("s03", "Some guests message you directly. Friday night — you're at sea. You reply Monday. She's already booked the boat that answered first.", ["directly", "monday", "answered first"], 1.2),
 ("s04", "Nobody wakes up wanting AI. You want more bookings.", ["nobody wakes up", "more bookings"], 1.0),
 ("s05", "Rewind. Same guest. Same question. This time, you have an AI Growth Operator.", ["rewind", "growth operator"], 0.5),
 ("s06", "First, it checks what AI can actually understand about your website. Thirty-four checks. One score. The fixes that matter.", ["understand", "thirty-four", "fixes that matter"], 0.5),
 ("s07", "When she writes, she hears back right away. And a reply is already drafted on your phone.", ["right away", "drafted"], 0.5),
 ("s08", "The AI drafts. You decide. One tap — sent. And the conversation is logged in your CRM.", ["you decide", "logged"], 0.6),
 ("s09", "Every morning, you know who's new, who's warm, and who's starting to slip away.", ["every morning", "slip away"], 0.8),
 ("s10", "A-I-deaz AI Lab doesn't sell you another CRM. We install an AI Growth Operator inside the tools you already use — and run it with you.", ["another crm", "run it with you"], 0.9),
 ("s11", "The people in this film are AI. The product screens are real.", ["people in this film", "screens are real"], 0.8),
 ("s12", "What does AI see when it looks at your business? Find out free at A-I-deaz dot X-Y-Z slash A-P-I.", ["your business", "find out free"], 0.0),
]
def rep(url, body=None, method="POST"):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None, method=method,
                                 headers={"Authorization": f"Bearer {REP}", "Content-Type": "application/json", "Prefer": "wait=60"})
    return json.load(urllib.request.urlopen(req, timeout=180))
dur = lambda p: float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout)
concat, bad, chars = [], 0, 0
for sc, text, keys, pause in LINES:
    chars += len(text)
    p = rep("https://api.replicate.com/v1/models/minimax/speech-2.8-hd/predictions",
            {"input": {"text": text, "voice_id": VOICE, "emotion": "calm", "language_boost": "English", "audio_format": "mp3", "sample_rate": 44100}})
    while p.get("status") not in ("succeeded", "failed", "canceled"):
        time.sleep(2); p = rep(f"https://api.replicate.com/v1/predictions/{p['id']}", method="GET")
    if p["status"] != "succeeded": print("FAIL", sc, p.get("error")); bad += 1; continue
    mp3 = f"{OUT}/{sc}.mp3"; urllib.request.urlretrieve(p["output"] if isinstance(p["output"], str) else p["output"][0], mp3)
    t = json.load(urllib.request.urlopen(urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEM}",
        data=json.dumps({"contents": [{"parts": [{"inline_data": {"mime_type": "audio/mp3", "data": base64.b64encode(open(mp3, "rb").read()).decode()}},
                                                  {"text": "Transcribe this audio verbatim. Output only the transcript."}]}]}).encode(),
        headers={"Content-Type": "application/json"}), timeout=180))["candidates"][0]["content"]["parts"][0]["text"].strip()
    low = t.lower().replace("34", "thirty-four").replace("thirty four", "thirty-four")
    miss = [k for k in keys if k not in low]; bad += bool(miss)
    print(f"{'OK' if not miss else 'MISSING ' + str(miss)} {sc} {dur(mp3):.1f}s :: {t[:110]}")
    concat.append(mp3)
    if pause:
        sil = f"{OUT}/_sil_{sc}.mp3"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(pause), "-b:a", "160k", sil], check=True)
        concat.append(sil)
open(f"{OUT}/_list.txt", "w").write("".join(f"file '{c}'\n" for c in concat))
full = f"{OUT}/narration_mm_full.mp3"
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", f"{OUT}/_list.txt", "-ar", "44100", "-ac", "1", "-b:a", "160k", full], check=True)
print(f"\nFULL {full} {dur(full):.1f}s · {chars} chars ≈ ${chars/1000*0.10:.2f} · lines needing a retake: {bad}")
