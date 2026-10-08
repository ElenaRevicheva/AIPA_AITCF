# Atuona film #9 voice-over (runs on Oracle in /home/ubuntu/atuona-film9): gpt-4o-mini-tts with acting direction, film #8's
# vo.py. One voice for the whole film — Kira (marin) — because every stanza is Elena's own voice. One mp3 per shot
# (vo/<sid>.mp3) from cut.json's English stanza, unchanged (" / " becomes a line break = a short pause).
import json, os, re, subprocess

ENV = open("/home/ubuntu/cto-aipa/.env").read()
KEY = re.search(r"^OPENAI_API_KEY=(.*)$", ENV, re.M).group(1).strip().strip('"')
CUT = json.load(open("cut.json", encoding="utf-8"))
VOICES = {
    "kira": ("marin", "A Russian woman in her thirties, speaking English with a slight Russian accent. Low, husky, unhurried, "
                      "very close to the microphone, almost a whisper that could break. Raw emotion held back by pride; a poet "
                      "saying her own lines, not performing them. Never sweet, never theatrical, never cheerful. Let each line "
                      "break land as a short pause."),
}
os.makedirs("vo", exist_ok=True)
for it in CUT["items"]:
    if it.get("card") or not it.get("stanza"):
        continue
    out = f"vo/{it['sid']}.mp3"
    if not (os.path.exists(out) and os.path.getsize(out) > 2000):
        voice, instr = VOICES[it.get("voice", "kira")]
        text = "\n".join(l.strip() for l in it["stanza"].split(" / "))
        body = json.dumps({"model": "gpt-4o-mini-tts", "voice": voice, "input": text, "instructions": instr, "response_format": "mp3"})
        r = subprocess.run(["curl", "-s", "-m", "90", "-o", out, "-w", "%{http_code}", "https://api.openai.com/v1/audio/speech",
                            "-H", f"Authorization: Bearer {KEY}", "-H", "Content-Type: application/json", "--data-binary", "@-"],
                           input=body, capture_output=True, text=True)
        if r.stdout != "200":
            print(it["sid"], "HTTP", r.stdout, open(out, errors="replace").read()[:200])
            os.remove(out)
            continue
    d = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", out],
                       capture_output=True, text=True).stdout.strip()
    print(f"{it['sid']:>4} {float(d):5.1f}s  (edit {it['edit']}s)  {it['stanza'][:70]}")
