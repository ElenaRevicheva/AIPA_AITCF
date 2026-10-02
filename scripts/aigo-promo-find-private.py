# Ask Gemini where the private text is on each real screen; output boxes (0-1000 normalised) for the laptop to blur.
import base64, json, os, urllib.request, glob
KEY = [l.split("=", 1)[1].strip().strip('"') for l in open(os.path.expanduser("~/cto-aipa/.env")) if l.startswith("GEMINI_API_KEY=")][0]
OWNER = " or ".join(f"'{n.strip()}'" for n in os.environ.get("OWNER_NAMES", "").split(",") if n.strip()) or "the account owner"
ASK = ("Find every occurrence on this phone screenshot of: (1) any email address; (2) the person name " + OWNER + " "
       "(alone or in a longer title); (3) the name of any real business, company, boat operator, tour agency or brand that is NOT "
       "AIdeazz, ChatGPT, OpenAI, WhatsApp, Telegram, HubSpot or Gmail (for example charter/tour company names, map place cards, "
       "review-site names with ratings). Return ONLY a JSON array like [{\"label\":\"...\",\"box_2d\":[ymin,xmin,ymax,xmax]}] with "
       "coordinates normalised 0-1000. Cover the whole text line of each item. Return [] if there is nothing.")
files = sorted(glob.glob("elena-phone-20260930-take2/0[1-5]*.jpg") + glob.glob("elena-phone-20260930-take3/S6_*.jpg")
               + glob.glob("elena-phone-20260930-take3/S1_answer_*.jpg"))
out = {}
for f in files:
    body = {"contents": [{"parts": [{"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(open(f, "rb").read()).decode()}}, {"text": ASK}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0}}
    r = json.load(urllib.request.urlopen(urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={KEY}",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}), timeout=180))
    txt = r["candidates"][0]["content"]["parts"][0]["text"]
    try: boxes = json.loads(txt)
    except Exception: boxes = []
    out[f] = boxes
    print(f, "->", [b.get("label", "")[:40] for b in boxes])
json.dump(out, open("private_boxes.json", "w"), indent=1)
