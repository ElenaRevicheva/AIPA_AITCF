# Relocation film (ICP #3, 2 Oct 2026): narration lines 1-4 are new (plan docs/selling/video/2026-10-02_RELOCATION_FILM_PLAN.md §3,
# approved by Elena 2 Oct: "go"). Same voice as the yacht and villa films (MiniMax 2.8 HD "English_magnetic_voiced_man", calm).
# s05 is word-for-word the villa's line 5 and s06-s12 the yacht's, so those takes are copied ($0).
# Every new take is transcribed back by TWO Gemini models; a word missing in either one flags the take for a retake.
import base64, json, os, shutil, subprocess, time, urllib.request
ENV = os.path.expanduser("~/cto-aipa/.env")
env = lambda n: [l.split("=", 1)[1].strip().strip('"') for l in open(ENV) if l.startswith(n + "=")][0]
REP, GEM = env("REPLICATE_API_TOKEN"), env("GEMINI_API_KEY")
BASE = os.path.expanduser("~/aigo-reloc")
OUT = f"{BASE}/voice"; os.makedirs(OUT, exist_ok=True)
VOICE = "English_magnetic_voiced_man"
LINES = [
 ("s01", "Your next clients are moving to Panama — a mother to the mountains, her son to the city. They aren't calling you. They're asking an AI.",
  ["next clients", "panama", "mother", "mountains", "son", "the city", "aren't calling", "asking an ai"], 0.6),
 ("s02", "It tends to suggest the agencies and law firms it can understand. If it can't understand your website, you may not make the list.",
  ["tends to suggest", "agencies", "law firms", "can't understand", "make the list"], 0.8),
 ("s03", "Some clients message you directly. Friday — you're showing a house, or you're at immigration with another family. You reply Monday. They've already chosen the one that answered first.",
  ["clients", "directly", "friday", "showing a house", "immigration", "another family", "monday", "already chosen", "answered first"], 1.2),
 ("s04", "Nobody wakes up wanting AI. You want more clients.", ["nobody wakes up", "more clients"], 1.0),
]
def rep(url, body=None, method="POST"):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None, method=method,
                                 headers={"Authorization": f"Bearer {REP}", "Content-Type": "application/json", "Prefer": "wait=60"})
    return json.load(urllib.request.urlopen(req, timeout=180))
def transcribe(mp3, model):
    body = {"contents": [{"parts": [{"inline_data": {"mime_type": "audio/mp3", "data": base64.b64encode(open(mp3, "rb").read()).decode()}},
                                    {"text": "Transcribe this audio verbatim, keeping contractions exactly as spoken. Output only the transcript."}]}]}
    r = json.load(urllib.request.urlopen(urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEM}",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}), timeout=240))
    return r["candidates"][0]["content"]["parts"][0]["text"].strip()
norm = lambda t: t.lower().replace("’", "'").replace("a.i.", "ai").replace("a i", "ai")
dur = lambda p: float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout)
only = set(os.environ.get("ONLY", "").split(",")) - {""}
keep = set(os.environ.get("KEEP", "").split(",")) - {""}   # takes already on disk: re-check, do not re-record or re-bill
bad, chars, log = 0, 0, []
for sc, text, keys, pause in LINES:
    if only and sc not in only and sc not in keep: continue
    mp3 = f"{OUT}/{sc}.mp3"
    if sc not in keep:
      chars += len(text)
      p = rep("https://api.replicate.com/v1/models/minimax/speech-2.8-hd/predictions",
            {"input": {"text": text, "voice_id": VOICE, "emotion": "calm", "language_boost": "English", "audio_format": "mp3", "sample_rate": 44100}})
      while p.get("status") not in ("succeeded", "failed", "canceled"):
          time.sleep(2); p = rep(f"https://api.replicate.com/v1/predictions/{p['id']}", method="GET")
      if p["status"] != "succeeded": print("FAIL", sc, p.get("error")); bad += 1; continue
      urllib.request.urlretrieve(p["output"] if isinstance(p["output"], str) else p["output"][0], mp3)
    miss_all = []
    for model in ("gemini-2.5-flash", "gemini-3.5-flash"):   # gemini-2.5-pro 404s since Oct 2026
        t = transcribe(mp3, model)
        miss = [k for k in keys if k not in norm(t)]
        miss_all += miss
        print(f"  {model}: {'OK' if not miss else 'MISSING ' + str(miss)} :: {t}")
    bad += bool(miss_all)
    print(f"{'OK' if not miss_all else 'RETAKE'} {sc} {dur(mp3):.2f}s")
    if sc not in keep: log.append({"line": sc, "chars": len(text), "usd": round(len(text) / 1000 * 0.10, 4), "missing": sorted(set(miss_all))})
    sil = f"{OUT}/_sil_{sc}.mp3"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(pause), "-b:a", "160k", sil], check=True)
if True:
    shutil.copy(os.path.expanduser("~/aigo-villa/voice/s05.mp3"), f"{OUT}/s05.mp3")
    for k in ("s06", "s07", "s08", "s09", "s10", "s11", "s12"):
        shutil.copy(os.path.expanduser(f"~/aigo-promo/voice/full_mm/{k}.mp3"), f"{OUT}/{k}.mp3")
with open(f"{BASE}/ledger.jsonl", "a") as f:
    f.write(json.dumps({"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "kind": "voice", "id": ",".join(l["line"] for l in log),
                        "engine": "minimax-speech-2.8-hd", "chars": chars, "status": "succeeded", "usd": round(chars / 1000 * 0.10, 4)}) + "\n")
print(f"recorded {len(log)} lines, {chars} chars ≈ ${chars/1000*0.10:.2f}; copied villa s05 + 7 yacht takes; lines needing a retake: {bad}")
