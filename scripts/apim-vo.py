# /api merged film - narration in the OLD films' voice (Elena 1 Oct: "voice from old films") = OpenAI tts-1 / onyx / speed 0.9,
# called through curl (node/python fetch quirks on Oracle - FILM_COMPILATION_GUIDE). Each take transcribed back (Gemini) to verify.
import base64, json, os, subprocess, urllib.request
ENV = os.path.expanduser("~/cto-aipa/.env")
def env(n): return [l.split("=", 1)[1].strip().strip('"') for l in open(ENV) if l.startswith(n + "=")][0]
OAI, GEM = env("OPENAI_API_KEY"), env("GEMINI_API_KEY")
OUT = os.path.expanduser("~/aigo-promo/apim/vo"); os.makedirs(OUT, exist_ok=True)
L = [
 ("a01", "Can AI find and cite your business?", ["cite your business"]),
 ("a02", "Google ranked your page. In twenty twenty-six, that is only half the fruit.", ["google ranked", "half the fruit"]),
 ("a03", "Your next customer asks ChatGPT first. It suggests the businesses it can understand. If it can't understand your website, you may not make the list.", ["chatgpt first", "make the list"]),
 ("a04", "Find out free. Open aideazz dot x y z, slash a p i. Type your website. Click, audit.", ["find out free", "type your website"]),
 ("a05", "Seconds later: one score, out of a hundred.", ["seconds later", "hundred"]),
 ("a06", "Behind that score: thirty-four checks, in four groups.", ["thirty-four checks", "four groups"]),
 ("a07", "One. Can the AI robots get in? ChatGPT, Claude, Gemini and Perplexity each send their own crawler. Block one, and that assistant never reads you.", ["robots get in", "never reads you"]),
 ("a08", "Two. Does your site tell AI who you are, and what you sell, in the format machines read?", ["who you are", "machines read"]),
 ("a09", "Three, the biggest. Does your page answer the questions customers actually ask? Questions as headings. Facts in lists. That is what gets quoted.", ["the biggest", "gets quoted"]),
 ("a10", "Four. Is it fast, secure, and readable without JavaScript?", ["fast, secure", "javascript"]),
 ("a11", "For every check that fails: what we saw, why it matters, and the exact fix.", ["every check that fails", "exact fix"]),
 ("a12", "Being found is step one. Our AI Growth Operator answers the guest, drafts your reply, and logs it in your CRM.", ["step one", "growth operator", "crm"]),
 ("a13", "Run yours free. aideazz dot x y z, slash a p i.", ["run yours free"]),
]
chars = 0; bad = 0
for k, text, keys in L:
    out = f"{OUT}/{k}.mp3"; chars += len(text)
    body = f"{OUT}/_{k}.json"; json.dump({"model": "tts-1", "voice": "onyx", "input": text, "response_format": "mp3", "speed": 0.9}, open(body, "w"))
    subprocess.run(["curl", "-sS", "-o", out, "https://api.openai.com/v1/audio/speech", "-H", f"Authorization: Bearer {OAI}",
                    "-H", "Content-Type: application/json", "--data-binary", f"@{body}"], check=True); os.remove(body)
    b = base64.b64encode(open(out, "rb").read()).decode()
    t = json.load(urllib.request.urlopen(urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEM}",
        data=json.dumps({"contents": [{"parts": [{"inline_data": {"mime_type": "audio/mp3", "data": b}}, {"text": "Transcribe this audio verbatim. Output only the transcript."}]}]}).encode(),
        headers={"Content-Type": "application/json"}), timeout=180))["candidates"][0]["content"]["parts"][-1]["text"].strip()
    low = t.lower().replace("34", "thirty-four").replace("thirty four", "thirty-four")
    miss = [x for x in keys if x not in low]; bad += bool(miss)
    d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], capture_output=True, text=True).stdout)
    print(f"{'OK ' if not miss else 'MISSING ' + str(miss)} {k} {d:.2f}s :: {t[:120]}")
print(f"chars={chars} (~${chars * 15 / 1e6:.3f} at tts-1 $15/1M) bad={bad}")
