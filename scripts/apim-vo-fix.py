import base64, json, os, subprocess, urllib.request, shutil
ENV = os.path.expanduser("~/cto-aipa/.env")
def env(n): return [l.split("=", 1)[1].strip().strip('"') for l in open(ENV) if l.startswith(n + "=")][0]
OAI, GEM = env("OPENAI_API_KEY"), env("GEMINI_API_KEY")
OUT = os.path.expanduser("~/aigo-promo/apim/vo")
def tr(path):
    b = base64.b64encode(open(path, "rb").read()).decode()
    return json.load(urllib.request.urlopen(urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEM}",
        data=json.dumps({"contents": [{"parts": [{"inline_data": {"mime_type": "audio/mp3", "data": b}}, {"text": "Transcribe this audio verbatim. Output only the transcript."}]}]}).encode(),
        headers={"Content-Type": "application/json"}), timeout=180))["candidates"][0]["content"]["parts"][-1]["text"].strip()
takes = {"a01": ["Can AI find, and cite, your business?", "Can A.I. find and cite your business?"],
         "a13": ["Run yours free, at aideazz dot x y z, slash a p i.", "Run yours free. Aideazz dot x, y, z. Slash a, p, i."]}
for k, variants in takes.items():
    for i, text in enumerate(variants):
        out = f"{OUT}/{k}_t{i}.mp3"; body = f"{OUT}/_b.json"
        json.dump({"model": "tts-1", "voice": "onyx", "input": text, "response_format": "mp3", "speed": 0.9}, open(body, "w"))
        subprocess.run(["curl", "-sS", "-o", out, "https://api.openai.com/v1/audio/speech", "-H", f"Authorization: Bearer {OAI}",
                        "-H", "Content-Type: application/json", "--data-binary", f"@{body}"], check=True); os.remove(body)
        print(k, f"t{i}", repr(text), "::", tr(out))
print("REF old v19 v_cta ::", tr(os.path.expanduser("~/aideazz-api-film-v19/vo/v_cta.mp3")))
