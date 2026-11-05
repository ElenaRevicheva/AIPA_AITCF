"""EspaLuz: Runway Characters (gwm1_avatars) - custom avatar from her photo, lip-synced video from our own free voice."""
import json, re, subprocess, sys, time, urllib.request, urllib.error
KEY = re.search(r"^RUNWAY_API_KEY=(.*)$", open("/home/ubuntu/whitespace/.env").read(), re.M).group(1).strip().strip('"')
H = {"Authorization": "Bearer " + KEY, "X-Runway-Version": "2024-11-06", "Content-Type": "application/json"}
API = "https://api.dev.runwayml.com/v1"
PROC = sys.argv[1] if len(sys.argv) > 1 else "none"
def call(m, p, b=None):
    r = urllib.request.Request(API + p, method=m, headers=H, data=json.dumps(b).encode() if b else None)
    try:
        with urllib.request.urlopen(r, timeout=120) as x: return json.loads(x.read())
    except urllib.error.HTTPError as e: return {"_error": e.code, "_body": e.read().decode()[:600]}
def upload(path, name):
    u = call("POST", "/uploads", {"filename": name, "type": "ephemeral"})
    if "_error" in u: sys.exit("UPLOAD ERR " + str(u))
    a = ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", u["uploadUrl"]]
    for k, v in u["fields"].items(): a += ["-F", f"{k}={v}"]
    a += ["-F", f"file=@{path}"]
    print("upload", name, subprocess.check_output(a).decode(), flush=True)
    return u["runwayUri"]
print("credits:", call("GET", "/organization").get("creditBalance"), flush=True)
img = upload("espaluz-front.png", "espaluz-front.png")
av = call("POST", "/avatars", {"name": "EspaLuz", "personality": "You are a friendly language tutor. You help adults practise Spanish and English in everyday conversation, patiently and clearly.",
    "referenceImage": img, "voice": {"type": "runway-live-preset", "presetId": "clara"}, "imageProcessing": PROC})
print("avatar:", {k: av.get(k) for k in ("id", "status", "_error", "_body")}, flush=True)
if "_error" in av: sys.exit(1)
t0 = time.time()
while time.time() - t0 < 300:
    a = call("GET", "/avatars/" + av["id"])
    if a.get("status") == "READY": print("avatar READY in", int(time.time() - t0), "s", flush=True); break
    if a.get("status") == "FAILED": sys.exit("avatar FAILED " + str(a.get("failureReason")))
    time.sleep(6)
aud = upload("voice.mp3", "voice.mp3")
t = call("POST", "/avatar_videos", {"model": "gwm1_avatars", "avatar": {"type": "custom", "avatarId": av["id"]}, "speech": {"type": "audio", "audio": aud}})
print("video task:", {k: t.get(k) for k in ("id", "_error", "_body")}, flush=True)
if "_error" in t: sys.exit(1)
t0 = time.time()
while time.time() - t0 < 420:
    p = call("GET", "/tasks/" + t["id"])
    if p.get("status") == "SUCCEEDED":
        urllib.request.urlretrieve(p["output"][0], "espaluz-talking.mp4"); print("VIDEO OK in", int(time.time() - t0), "s", flush=True); break
    if p.get("status") in ("FAILED", "CANCELLED"): sys.exit("video " + str(p.get("status")) + " " + str(p.get("failure")))
    time.sleep(6)
print("avatar id:", av["id"]); print("credits after:", call("GET", "/organization").get("creditBalance"))
