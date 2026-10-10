# Atuona film #9 voice-over (runs on Oracle in /home/ubuntu/atuona-film9): gpt-4o-mini-tts with acting direction, film #8's
# vo.py. One voice for the whole film — Kira (marin) — because every stanza is Elena's own voice. One mp3 per shot
# (vo/<sid>.mp3) from cut.json's English stanza, unchanged (" / " becomes a line break = a short pause).
import json, os, re, subprocess

ENV = open(os.environ.get("FILM9_ENV", "/home/ubuntu/cto-aipa/.env"), encoding="utf-8").read()   # laptop: another repo's .env
KEY = re.search(r"^OPENAI_API_KEY=(.*)$", ENV, re.M).group(1).strip().strip('"')
CUT = json.load(open(os.environ.get("FILM9_CUT", "cut.json"), encoding="utf-8"))
VO = os.environ.get("FILM9_VO", "vo")
# v6 (Elena, 10 Oct: "voice should be one like in other movies"): "onyx" = the narrator of the Atuona films #1-#7, OpenAI tts-1,
# voice onyx, speed 0.9, no acting direction (FILM_COMPILATION_GUIDE). An entry is (voice, instructions[, model, speed]).
VOICES = {
    "onyx": ("onyx", None, "tts-1", 0.9),
    "kira": ("marin", "A Russian woman in her thirties, speaking English with a slight Russian accent. Low, husky, unhurried, "
                      "very close to the microphone, almost a whisper that could break. Raw emotion held back by pride; a poet "
                      "saying her own lines, not performing them. Never sweet, never theatrical, never cheerful. Let each line "
                      "break land as a short pause."),
}
os.makedirs(VO, exist_ok=True)
for it in CUT["items"]:
    if it.get("card") or not it.get("stanza"):
        continue
    out = f"{VO}/{it['sid']}.mp3"
    if not (os.path.exists(out) and os.path.getsize(out) > 2000):
        voice, instr, *rest = VOICES[it.get("voice", "kira")]
        model, speed = (rest + ["gpt-4o-mini-tts", None])[:2] if rest else ("gpt-4o-mini-tts", None)
        text = "\n".join(l.strip() for l in it["stanza"].split(" / "))
        req = {"model": model, "voice": voice, "input": text, "response_format": "mp3"}
        if instr: req["instructions"] = instr
        if speed: req["speed"] = speed
        body = json.dumps(req)
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
