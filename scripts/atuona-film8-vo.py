# Atuona film #8 voice-over (runs on Oracle in /home/ubuntu/atuona-film8): gpt-4o-mini-tts with acting direction.
# Ule / narrator = cedar, Kira = marin. One mp3 per voice line (vo/<shot>_<k>.mp3); s17 has two, joined at compile.
# Text is the plan's stanza, unchanged: verbatim ATUONA lines, our translation for LITPROM #007 / #039.
import json, os, re, subprocess

ENV = open("/home/ubuntu/cto-aipa/.env").read()
KEY = re.search(r"^OPENAI_API_KEY=(.*)$", ENV, re.M).group(1).strip().strip('"')
PLAN = json.load(open("plan.json", encoding="utf-8"))
VOICES = {
    "ule": ("cedar", "A Norwegian man of about fifty, speaking English with a faint Scandinavian accent. Low, dry, controlled "
                     "and unhurried, close to the microphone, as if speaking into someone's ear in a dark room. Restrained menace "
                     "and restrained desire. Never theatrical, never warm, never sweet. Let each line break land as a short pause."),
    "kira": ("marin", "A Russian woman in her thirties, speaking English with a slight Russian accent. Low, husky, exhausted and "
                      "defiant, very close to the microphone, almost a whisper that could break. Raw emotion held back by pride. "
                      "Never sweet, never theatrical, never cheerful. Let each line break land as a short pause."),
}
os.makedirs("vo", exist_ok=True)
for sid, shot in sorted(PLAN["shots"].items()):
    if not re.fullmatch(r"s\d\d", sid):
        continue
    for k, seg in enumerate(shot["vo"]):
        out = f"vo/{sid}_{k}.mp3"
        if not (os.path.exists(out) and os.path.getsize(out) > 2000):
            voice, instr = VOICES[seg["voice"]]
            body = json.dumps({"model": "gpt-4o-mini-tts", "voice": voice, "input": seg["text"],
                               "instructions": instr, "response_format": "mp3"})
            r = subprocess.run(["curl", "-s", "-m", "90", "-o", out, "-w", "%{http_code}",
                                "https://api.openai.com/v1/audio/speech", "-H", f"Authorization: Bearer {KEY}",
                                "-H", "Content-Type: application/json", "--data-binary", "@-"],
                               input=body, capture_output=True, text=True)
            if r.stdout != "200":
                print(sid, k, "HTTP", r.stdout, open(out, errors="replace").read()[:200])
                os.remove(out)
                continue
        dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", out],
                             capture_output=True, text=True).stdout.strip()
        print(f"{sid}_{k} {seg['voice']:4} {float(dur):5.1f}s  (shot {shot['duration']}s)")
