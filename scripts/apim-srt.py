# /api merged film - YouTube caption files (EN = the locked narration, ES = the burned-in Spanish + the title/CTA lines). Runs on Oracle.
# Same clock as apim-cut.py (decoded voice + pauses); cue splits = the ES caption chunks (timed to each line's own pauses).
import json, os, subprocess
B = os.path.expanduser("~/aigo-promo/apim"); VO = f"{B}/vo"
PAUSE = {"a01": .8, "a02": .8, "a03": 1.0, "a04": .8, "a05": .7, "a06": .8, "a07": .8, "a08": .8, "a09": .8, "a10": .8, "a11": 1.0, "a12": .9, "a13": 4.0}
dec = lambda p: len(subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-f", "s16le", "-ac", "1", "-ar", "44100", "-"], capture_output=True).stdout) / 88200
L = {k: dec(f"{VO}/{k}.mp3") for k in PAUSE}; start, t = {}, 1.2
for k in PAUSE: start[k] = t; t += L[k] + PAUSE[k]
man = json.load(open(f"{B}/assets/manifest.json", encoding="utf-8"))
EN = {"a02": ["Google ranked your page.", "In 2026, that is only half the fruit."],
      "a03": ["Your next customer asks ChatGPT first.", "It suggests the businesses it can understand.", "If it can't understand your website, you may not make the list."],
      "a04": ["Find out free. Open aideazz.xyz/api.", "Type your website. Click Audit."],
      "a05": ["Seconds later: one score, out of a hundred."], "a06": ["Behind that score: thirty-four checks, in four groups."],
      "a07": ["One. Can the AI robots get in?", "ChatGPT, Claude, Gemini and Perplexity each send their own crawler.", "Block one, and that assistant never reads you."],
      "a08": ["Two. Does your site tell AI who you are, and what you sell,", "in the format machines read?"],
      "a09": ["Three, the biggest.", "Does your page answer the questions customers actually ask?", "Questions as headings. Facts in lists.", "That is what gets quoted."],
      "a10": ["Four. Is it fast, secure, and readable without JavaScript?"], "a11": ["For every check that fails:", "what we saw, why it matters, and the exact fix."],
      "a12": ["Being found is step one.", "Our AI Growth Operator answers the guest,", "drafts your reply, and logs it in your CRM."]}
caps = {}
for c in man["captions"]: caps.setdefault(c["line"], []).append(c)
def ts(x): ms = int(round(x * 1000)); return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
for lang in ("en", "es"):
    rows = [(start["a01"], start["a01"] + L["a01"] + 0.3, "Can AI find and cite your business?" if lang == "en" else "¿Puede la IA encontrar y citar tu negocio?")]
    for k, cs in caps.items():
        for i, c in enumerate(cs):
            rows.append((start[k] + c["t0"], min(start[k] + c["t1"], start[k] + L[k] + 0.3), EN[k][i] if lang == "en" else c["text"]))
    rows.append((start["a13"], start["a13"] + L["a13"] + 0.4, "Run yours free. aideazz.xyz/api" if lang == "en" else "Haz la tuya gratis: aideazz.xyz/api"))
    rows.sort()
    out = f"{B}/cut1/AIGO_API_promo_{lang}.srt"
    open(out, "w", encoding="utf-8").write("".join(f"{i}\n{ts(a)} --> {ts(z)}\n{x}\n\n" for i, (a, z, x) in enumerate(rows, 1)))
    print(lang, len(rows), "cues ->", out)
