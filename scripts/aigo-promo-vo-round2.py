# AI Growth Operator promo - male narrator samples, ROUND 2. 30 Sep 2026.
# Elena's brief: "more juicy, confident, but still professional, middle 30s-40, not older".
# Runs on Oracle in ~/aigo-promo/voice. Two engines, each driven the way it actually listens:
#   OpenAI gpt-4o-mini-tts  - direction in the separate `instructions` field (never spoken)
#   Gemini 2.5 pro TTS      - documented "Say ...: <text>" cue (3.8 flash SPEAKS any direction)
# Every take is transcribed back; a take that speaks its direction is marked LEAKED and must not be used.
import base64, json, os, subprocess, urllib.request

ENV = os.path.expanduser("~/cto-aipa/.env")
def env(name):
    return [l.split("=", 1)[1].strip().strip('"') for l in open(ENV) if l.startswith(name + "=")][0]

OPENAI, GEMINI = env("OPENAI_API_KEY"), env("GEMINI_API_KEY")
OUT = os.path.expanduser("~/aigo-promo/voice")
TEXT = ("Your next charter guest is planning at midnight. She isn't calling you. She's asking an AI. "
        "Nobody wakes up wanting AI. You want more bookings. "
        "A-I-deaz AI Lab doesn't sell you another CRM. We install an AI Growth Operator inside the tools "
        "you already use - and run it with you.")
OPENAI_DIRECTION = ("Confident, charismatic male narrator in his mid-thirties. Premium brand commercial: energetic "
                    "but controlled, a warm smile in the voice, crisp consonants, persuasive momentum. Professional, "
                    "never a radio announcer, never sleepy. Land 'Nobody wakes up wanting AI' with quiet authority. "
                    "Say 'A-I-deaz' as 'ay-eye-DEAZ'.")
GEMINI_CUE = "Say with confident, charismatic energy, like a sharp mid-thirties premium brand narrator"
JOBS = [("openai", "verse"), ("openai", "echo"), ("openai", "ash"),
        ("gemini", "Puck"), ("gemini", "Orus"), ("gemini", "Fenrir")]

def post(url, body, headers):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **headers})
    return urllib.request.urlopen(req, timeout=180).read()

for engine, voice in JOBS:
    tag = f"r2_{engine}_{voice.lower()}"
    mp3 = f"{OUT}/sample_{tag}.mp3"
    try:
        if engine == "openai":
            audio = post("https://api.openai.com/v1/audio/speech",
                         {"model": "gpt-4o-mini-tts-2025-12-15", "voice": voice, "input": TEXT,
                          "instructions": OPENAI_DIRECTION, "response_format": "mp3"},
                         {"Authorization": f"Bearer {OPENAI}"})
            open(mp3, "wb").write(audio)
        else:
            r = json.loads(post(f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-tts:generateContent?key={GEMINI}",
                                {"contents": [{"parts": [{"text": f"{GEMINI_CUE}: {TEXT}"}]}],
                                 "generationConfig": {"responseModalities": ["AUDIO"],
                                                      "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}, {}))
            part = r["candidates"][0]["content"]["parts"][0]["inlineData"]
            rate = int(part["mimeType"].split("rate=")[1].split(";")[0]) if "rate=" in part.get("mimeType", "") else 24000
            pcm = f"{OUT}/{tag}.pcm"
            open(pcm, "wb").write(base64.b64decode(part["data"]))
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(rate), "-ac", "1", "-i", pcm, "-b:a", "160k", mp3], check=True)
            os.remove(pcm)
    except urllib.error.HTTPError as e:
        print(f"FAIL {tag}: HTTP {e.code} {e.read()[:200]}"); continue
    dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3], capture_output=True, text=True).stdout.strip()
    t = json.loads(post(f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI}",
                        {"contents": [{"parts": [{"inline_data": {"mime_type": "audio/mp3", "data": base64.b64encode(open(mp3, "rb").read()).decode()}},
                                                 {"text": "Transcribe this audio verbatim. Output only the transcript."}]}]}, {}))
    txt = t["candidates"][0]["content"]["parts"][0]["text"].strip()
    leaked = any(w in txt.lower() for w in ["narrator", "charismatic", "announcer", "thirties", "premium brand"])
    missing = [w for w in ["midnight", "bookings", "another crm", "run it with you"] if w not in txt.lower()]
    print(f"{'LEAKED' if leaked else 'OK'} {tag}: {dur}s{' MISSING ' + str(missing) if missing else ''} :: {txt[:90]}")
