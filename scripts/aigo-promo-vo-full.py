# AI Growth Operator promo - FULL narration, Elena's pick: OpenAI "verse" (30 Sep 2026).
# Runs on Oracle in ~/aigo-promo/voice. One file per scene (film #8 method) so each line can be placed and
# retaken on its own, plus a joined preview with the film's pauses. Every line is transcribed back and
# checked for its key words; a line that is LEAKED or MISSING must be retaken before it goes in the edit.
import base64, json, os, subprocess, urllib.request

ENV = os.path.expanduser("~/cto-aipa/.env")
def env(name):
    return [l.split("=", 1)[1].strip().strip('"') for l in open(ENV) if l.startswith(name + "=")][0]

OPENAI, GEMINI = env("OPENAI_API_KEY"), env("GEMINI_API_KEY")
OUT = os.path.expanduser("~/aigo-promo/voice/full_verse")
MODEL, VOICE = "gpt-4o-mini-tts-2025-12-15", "verse"
BASE = ("Confident, charismatic male narrator in his mid-thirties. Premium brand commercial: energetic but "
        "controlled, a warm smile in the voice, crisp consonants, persuasive momentum. Professional, never a radio "
        "announcer, never sleepy. Say 'A-I-deaz' as 'ay-eye-DEAZ'.")

# (scene, text, extra direction, key words the transcript must contain, pause AFTER this line in the preview, s)
LINES = [
    ("s01", "Your next charter guest is planning at midnight. She isn't calling you. She's asking an AI.",
     "Open intimate and intriguing, like sharing a secret.", ["midnight", "asking an ai"], 0.6),
    ("s02", "It suggests the boats it can understand. If it can't read your website, you're not on the list.",
     "Matter-of-fact, a little sting on 'not on the list'.", ["boats", "not on the list"], 0.8),
    ("s03", "Some guests still write. Friday night — you're at sea. You reply Monday. She's already booked the boat that answered first.",
     "Storytelling; let 'She's already booked' land with regret.", ["friday", "monday", "answered first"], 1.2),
    ("s04", "Nobody wakes up wanting AI. You want more bookings.",
     "Slow, quiet authority. The film's thesis.", ["nobody wakes up", "more bookings"], 1.0),
    ("s05", "Rewind. Same guest. Same question. This time, you have an AI Growth Operator.",
     "Energy lifts: 'Rewind' is crisp, then build to 'AI Growth Operator'.", ["rewind", "growth operator"], 0.5),
    ("s06", "First, it checks what AI can actually understand about your website. Thirty-four checks. One score. The fixes that matter.",
     "Clear and brisk, a confident demo voice.", ["understand", "thirty-four", "fixes that matter"], 0.5),
    ("s07", "When she writes, she hears back right away. And a reply is already drafted on your phone.",
     "Warm, reassuring.", ["right away", "drafted"], 0.5),
    ("s08", "The AI drafts. You decide. One tap — sent. And the conversation is logged in your CRM.",
     "Punchy: two beats on 'The AI drafts. You decide.' — the core line.", ["you decide", "logged"], 0.6),
    ("s09", "Every morning, you know who's new, who's warm, and who's starting to slip away.",
     "Easy rhythm, a light touch on 'slip away'.", ["every morning", "slip away"], 0.8),
    ("s10", "A-I-deaz AI Lab doesn't sell you another CRM. We install an AI Growth Operator inside the tools you already use — and run it with you.",
     "The brand promise: proud, confident, warm.", ["another crm", "run it with you"], 0.9),
    ("s11", "The people in this film are AI. The product screens are real.",
     "Intimate reveal, a small knowing smile.", ["people in this film", "screens are real"], 0.8),
    ("s12", "What does AI see when it looks at your business? Find out free at A-I-deaz dot X-Y-Z slash A-P-I.",
     "Inviting call to action; spell the address slowly and clearly.", ["your business", "find out free"], 0.0),
]

def post(url, body, headers):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **headers})
    return urllib.request.urlopen(req, timeout=180).read()

def duration(path):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                                capture_output=True, text=True).stdout.strip())

os.makedirs(OUT, exist_ok=True)
concat, total, bad = [], 0.0, 0
for scene, text, extra, keys, pause in LINES:
    mp3 = f"{OUT}/{scene}.mp3"
    open(mp3, "wb").write(post("https://api.openai.com/v1/audio/speech",
                               {"model": MODEL, "voice": VOICE, "input": text, "instructions": f"{BASE} {extra}",
                                "response_format": "mp3"}, {"Authorization": f"Bearer {OPENAI}"}))
    t = json.loads(post(f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI}",
                        {"contents": [{"parts": [{"inline_data": {"mime_type": "audio/mp3", "data": base64.b64encode(open(mp3, "rb").read()).decode()}},
                                                 {"text": "Transcribe this audio verbatim. Output only the transcript."}]}]}, {}))
    txt = t["candidates"][0]["content"]["parts"][0]["text"].strip()
    low = txt.lower().replace("34", "thirty-four").replace("thirty four", "thirty-four")
    leaked = any(w in low for w in ["narrator", "charismatic", "announcer", "thirties"])
    missing = [k for k in keys if k not in low]
    d = duration(mp3)
    total += d + pause
    bad += bool(leaked or missing)
    print(f"{'LEAKED' if leaked else ('MISSING ' + str(missing) if missing else 'OK')} {scene} {d:.1f}s :: {txt}")
    concat.append(mp3)
    if pause:
        sil = f"{OUT}/_sil_{scene}.mp3"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", str(pause),
                        "-b:a", "160k", sil], check=True)
        concat.append(sil)

lst = f"{OUT}/_list.txt"
open(lst, "w").write("".join(f"file '{p}'\n" for p in concat))
preview = f"{OUT}/narration_verse_full.mp3"
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-ar", "24000", "-ac", "1",
                "-b:a", "160k", preview], check=True)
print(f"\nPREVIEW {preview} {duration(preview):.1f}s (sum {total:.1f}s) · lines needing a retake: {bad}")
