# Round 3 narrator samples (Elena: "more natural - verse is robotic"). ElevenLabs v3 + MiniMax Speech 2.8 HD via
# Replicate ($0.10 / 1k chars each, 30 Sep). Same three lines as every round; each take transcribed back (Gemini).
import base64, json, os, time, urllib.request
ENV = os.path.expanduser("~/cto-aipa/.env")
env = lambda n: [l.split("=", 1)[1].strip().strip('"') for l in open(ENV) if l.startswith(n + "=")][0]
REP, GEM = env("REPLICATE_API_TOKEN"), env("GEMINI_API_KEY")
OUT = os.path.expanduser("~/aigo-promo/voice")
TEXT = ("Your next charter guest is planning at midnight. She isn't calling you. She's asking an AI. "
        "Nobody wakes up wanting AI. You want more bookings. "
        "A-I-deaz AI Lab doesn't sell you another CRM. We install an AI Growth Operator inside the tools you already use — and run it with you.")
JOBS = [("elevenlabs/v3", "Roger", {"stability": 0.45, "style": 0.25}), ("elevenlabs/v3", "Mark", {"stability": 0.45, "style": 0.25}),
        ("elevenlabs/v3", "Drew", {"stability": 0.45, "style": 0.25}), ("elevenlabs/v3", "James", {"stability": 0.45, "style": 0.25}),
        ("minimax/speech-2.8-hd", "English_magnetic_voiced_man", {}), ("minimax/speech-2.8-hd", "English_Trustworth_Man", {})]
def call(url, body=None, method="POST"):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None, method=method,
                                 headers={"Authorization": f"Bearer {REP}", "Content-Type": "application/json", "Prefer": "wait=60"})
    return json.load(urllib.request.urlopen(req, timeout=180))
for model, voice, extra in JOBS:
    tag = ("el_" if model.startswith("eleven") else "mm_") + voice.lower().replace("english_", "")
    inp = {"prompt": TEXT, "voice": voice, **extra} if model.startswith("eleven") else \
          {"text": TEXT, "voice_id": voice, "emotion": "calm", "language_boost": "English", "audio_format": "mp3", "sample_rate": 44100}
    try:
        p = call(f"https://api.replicate.com/v1/models/{model}/predictions", {"input": inp})
        while p.get("status") not in ("succeeded", "failed", "canceled"):
            time.sleep(3); p = call(f"https://api.replicate.com/v1/predictions/{p['id']}", method="GET")
    except urllib.error.HTTPError as e:
        print(f"FAIL {tag}: HTTP {e.code} {e.read()[:160]}"); continue
    if p["status"] != "succeeded": print(f"FAIL {tag}: {str(p.get('error'))[:160]}"); continue
    url = p["output"] if isinstance(p["output"], str) else p["output"][0]
    mp3 = f"{OUT}/sample_r3_{tag}.mp3"; urllib.request.urlretrieve(url, mp3)
    t = json.load(urllib.request.urlopen(urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEM}",
        data=json.dumps({"contents": [{"parts": [{"inline_data": {"mime_type": "audio/mp3", "data": base64.b64encode(open(mp3, "rb").read()).decode()}},
                                                  {"text": "Transcribe this audio verbatim. Output only the transcript."}]}]}).encode(),
        headers={"Content-Type": "application/json"}), timeout=180))["candidates"][0]["content"]["parts"][0]["text"].strip()
    missing = [k for k in ["midnight", "bookings", "another crm", "run it with you"] if k not in t.lower()]
    print(f"{'OK' if not missing else 'MISSING ' + str(missing)} {tag} :: {t[:100]}")
