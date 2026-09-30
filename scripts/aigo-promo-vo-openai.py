# AI Growth Operator promo - male narrator samples on OpenAI TTS (film #8's engine). 30 Sep 2026.
# Runs on Oracle in ~/aigo-promo/voice. gpt-4o-mini-tts takes acting direction in a SEPARATE
# `instructions` field, so the direction cannot be spoken (Gemini 3.8 flash TTS spoke it).
# Every sample is still transcribed back (Gemini, free tier) before anyone hears it.
import base64, json, os, subprocess, urllib.request

ENV = os.path.expanduser("~/cto-aipa/.env")
def env(name):
    return [l.split("=", 1)[1].strip().strip('"') for l in open(ENV) if l.startswith(name + "=")][0]

OPENAI, GEMINI = env("OPENAI_API_KEY"), env("GEMINI_API_KEY")
OUT = os.path.expanduser("~/aigo-promo/voice")
MODEL = "gpt-4o-mini-tts-2025-12-15"
INSTRUCTIONS = ("Warm, calm, confident male film narrator in his forties, telling a true story to a friend. "
                "Conversational and intimate, never a radio announcer. Unhurried: a short pause after each "
                "sentence, a longer one before 'Nobody wakes up wanting AI'. Say 'A-I-deaz' as 'ay-eye-DEAZ'.")
TEXT = ("Your next charter guest is planning at midnight. She isn't calling you. She's asking an AI. "
        "Nobody wakes up wanting AI. You want more bookings. "
        "A-I-deaz AI Lab doesn't sell you another CRM. We install an AI Growth Operator inside the tools "
        "you already use - and run it with you.")
VOICES = ["cedar", "ash", "onyx"]

for voice in VOICES:
    tag = f"openai_{voice}"
    mp3 = f"{OUT}/sample_{tag}.mp3"
    req = urllib.request.Request("https://api.openai.com/v1/audio/speech",
                                 data=json.dumps({"model": MODEL, "voice": voice, "input": TEXT,
                                                  "instructions": INSTRUCTIONS, "response_format": "mp3"}).encode(),
                                 headers={"Authorization": f"Bearer {OPENAI}", "Content-Type": "application/json"})
    try:
        open(mp3, "wb").write(urllib.request.urlopen(req, timeout=180).read())
    except urllib.error.HTTPError as e:
        print(f"FAIL {tag}: HTTP {e.code} {e.read()[:200]}"); continue
    dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3],
                         capture_output=True, text=True).stdout.strip()
    t = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI}",
                               data=json.dumps({"contents": [{"parts": [
                                   {"inline_data": {"mime_type": "audio/mp3", "data": base64.b64encode(open(mp3, "rb").read()).decode()}},
                                   {"text": "Transcribe this audio verbatim. Output only the transcript."}]}]}).encode(),
                               headers={"Content-Type": "application/json"})
    txt = json.load(urllib.request.urlopen(t, timeout=180))["candidates"][0]["content"]["parts"][0]["text"].strip()
    leaked = any(w in txt.lower() for w in ["narrator", "announcer", "forties", "pause"])
    print(f"{'LEAKED' if leaked else 'OK'} {tag}: {dur}s :: {txt}")
