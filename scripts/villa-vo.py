# Villa + charter film (ICP #2, 1 Oct 2026): narration v2 LOCKED by Elena. Same voice as the yacht film (MiniMax 2.8 HD
# "English_magnetic_voiced_man", calm). Only the 4 lines whose words differ are recorded; s04, s06-s12 are word-for-word the
# yacht film's and are copied from ~/aigo-promo/voice/full_mm (identical take, $0).
import base64, json, os, subprocess, time, urllib.request
ENV = os.path.expanduser("~/cto-aipa/.env")
env = lambda n: [l.split("=", 1)[1].strip().strip('"') for l in open(ENV) if l.startswith(n + "=")][0]
REP, GEM = env("REPLICATE_API_TOKEN"), env("GEMINI_API_KEY")
OUT = os.path.expanduser("~/aigo-villa/voice"); os.makedirs(OUT, exist_ok=True)
VOICE = "English_magnetic_voiced_man"
LINES = [
 ("s01", "Your next guests are planning New Year — three generations, one island. She isn't calling you. She's asking an AI.", ["new year", "one island", "asking an ai"], 0.6),
 ("s02", "It suggests the villas and charters it can understand. If it can't understand your website, you may not make the list.", ["villas and charters", "make the list"], 0.8),
 ("s03", "Some guests message you directly. Sunday — you're out at sea with another family. You reply Wednesday. She's already booked the island stay that answered first.", ["directly", "wednesday", "answered first"], 1.2),
 ("s05", "Rewind. Same family. Same question. This time, you have an AI Growth Operator.", ["rewind", "same family", "growth operator"], 0.5),
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
import shutil
for k in ("s04", "s06", "s07", "s08", "s09", "s10", "s11", "s12"):
    shutil.copy(os.path.expanduser(f"~/aigo-promo/voice/full_mm/{k}.mp3"), f"{OUT}/{k}.mp3")
print(f"recorded {len(LINES)} lines, {chars} chars ≈ ${chars/1000*0.10:.2f}; copied 8 identical yacht takes; lines needing a retake: {bad}")
