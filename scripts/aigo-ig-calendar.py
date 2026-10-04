# AIGO films -> Instagram Reels: writes one file per POST day (Panama date) for the NEW Make scenario
# "AIGO Films -> Instagram Reels" = the complete Buffer GraphQL createPost request (Make sends it verbatim, so no caption
# ever passes through Make's formula parser).
# Captions come from docs/selling/video/AIGO_INSTAGRAM_REELS.md (the five ``` blocks, in film order).
# usage: python aigo-ig-calendar.py <out dir>
import json, os, re, sys, datetime
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
DOC = os.path.join(os.path.dirname(__file__), "..", "docs", "selling", "video", "AIGO_INSTAGRAM_REELS.md")
caps = re.findall(r"```\n(.*?)\n```", open(DOC, encoding="utf-8").read(), re.S)
assert len(caps) == 5, len(caps)
BASE = "https://webhook.aideazz.xyz/influencer-images/ig-aigo"
CHANNEL = "68389b15d6d25b49a1d75b8e"   # Buffer: Instagram business channel
FILMS = ["yacht", "villa", "reloc", "medtour", "api"]   # same order as the caption blocks
DATES = {"2026-10-04": 0, "2026-10-06": 1, "2026-10-08": 2, "2026-10-10": 3, "2026-10-12": 4}
Q = ("mutation($input: CreatePostInput!) { createPost(input: $input) { "
     "... on PostActionSuccess { post { id status } } ... on MutationError { message } } }")
def body(i):
    return json.dumps({"query": Q, "variables": {"input": {
        "channelId": CHANNEL, "text": caps[i], "schedulingType": "automatic", "mode": "shareNow",
        "assets": [{"video": {"url": f"{BASE}/reel_{FILMS[i]}_v1.mp4"}}],
        "metadata": {"instagram": {"type": "reel", "shouldShareToFeed": True, "isAiGenerated": True}}}}}, ensure_ascii=False)
# Server files: ONLY post days, and each file IS the GraphQL request (Make GETs it and POSTs it to Buffer as-is; a day with
# no file returns 404, which the scenario's filter treats as "no post today"). The nginx path serves .json as
# application/octet-stream, so Make reads the body as text ({{toString(1.data)}}) and never parses it.
# A day that already posted is renamed <date>.json.posted; never rewrite it, or a rerun on that same day posts the Reel twice.
for f in os.listdir(OUT):
    if f.endswith(".json"): os.remove(os.path.join(OUT, f))
for k, i in DATES.items():
    if os.path.exists(os.path.join(OUT, f"{k}.json.posted")): continue
    open(os.path.join(OUT, f"{k}.json"), "w", encoding="utf-8").write(body(i))
print("post files:", sorted(os.listdir(OUT)))
