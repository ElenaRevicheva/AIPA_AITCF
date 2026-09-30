# AI Growth Operator promo - male narrator samples (Gemini TTS). 30 Sep 2026.
# gemini-3.8-flash-tts speaks EVERYTHING in the text (acting notes included) and rejects
# systemInstruction ("Developer instruction is not enabled"), so it gets the script only.
# gemini-2.5-pro-preview-tts is tried with the documented "Say ...: <text>" style cue.
# Every sample is transcribed back; a sample that speaks the direction is marked LEAKED.
import base64, json, os, subprocess, urllib.request

KEY = [l.split("=", 1)[1].strip().strip('"') for l in open(os.path.expanduser("~/cto-aipa/.env")) if l.startswith("GEMINI_API_KEY=")][0]
OUT = os.path.expanduser("~/aigo-promo/voice")
STYLE = "Say warmly and calmly, like a film narrator telling a true story to a friend"
TEXT = ("Your next charter guest is planning at midnight. She isn't calling you. She's asking an AI. "
        "Nobody wakes up wanting AI. You want more bookings. "
        "A-I-deaz AI Lab doesn't sell you another CRM. We install an AI Growth Operator inside the tools "
        "you already use - and run it with you.")
JOBS = [("gemini-3.8-flash-tts", "Algieba", False), ("gemini-3.8-flash-tts", "Charon", False),
        ("gemini-2.5-pro-preview-tts", "Charon", True), ("gemini-2.5-pro-preview-tts", "Algieba", True)]

def call(model, body):
    req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={KEY}",
                                 data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=180))

for model, voice, styled in JOBS:
    tag = ("pro25" if "2.5-pro" in model else "flash38") + "_" + voice.lower()
    body = {"contents": [{"parts": [{"text": f"{STYLE}: {TEXT}" if styled else TEXT}]}],
            "generationConfig": {"responseModalities": ["AUDIO"],
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
    try:
        r = call(model, body)
    except urllib.error.HTTPError as e:
        print(f"FAIL {tag}: HTTP {e.code} {e.read()[:200]}"); continue
    part = r["candidates"][0]["content"]["parts"][0]["inlineData"]
    rate = int(part["mimeType"].split("rate=")[1].split(";")[0]) if "rate=" in part.get("mimeType", "") else 24000
    pcm, mp3 = f"{OUT}/{tag}.pcm", f"{OUT}/sample_{tag}.mp3"
    open(pcm, "wb").write(base64.b64decode(part["data"]))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(rate), "-ac", "1", "-i", pcm, "-b:a", "160k", mp3], check=True)
    os.remove(pcm)
    dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3], capture_output=True, text=True).stdout.strip()
    t = call("gemini-2.5-flash", {"contents": [{"parts": [{"inline_data": {"mime_type": "audio/mp3", "data": base64.b64encode(open(mp3, "rb").read()).decode()}},
                                                          {"text": "Transcribe this audio verbatim. Output only the transcript."}]}]})
    txt = t["candidates"][0]["content"]["parts"][0]["text"].strip()
    leaked = any(w in txt.lower() for w in ["narrator", "warmly", "true story to a friend"])
    print(f"{'LEAKED' if leaked else 'OK'} {tag}: {dur}s :: {txt[:110]}")
