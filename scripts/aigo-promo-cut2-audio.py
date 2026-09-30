# cut v2 audio: decode every narration line + pause and join with the concat FILTER (the concat demuxer refuses mixed
# mp3 params), loudness-normalise, mux onto the already-built picture. Same pauses as cut2.py.
import os, subprocess, json
B = os.path.expanduser("~/aigo-promo"); VO = f"{B}/voice/full_mm"
PAUSE = {"s01": .8, "s02": 1.0, "s03": 1.4, "s04": 2.0, "s05": .8, "s06": .8, "s07": .8, "s08": .9, "s09": 1.0, "s10": 1.2, "s11": 1.2, "s12": 2.5}
INTRO = 1.5
dur = lambda p: float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout)
args, fc, n = [], [], 0
def silence(t):
    global n; args.extend(["-f", "lavfi", "-t", str(t), "-i", "anullsrc=r=44100:cl=mono"]); fc.append(f"[{n}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono[a{n}]"); n += 1
def line(p):
    global n; args.extend(["-i", p]); fc.append(f"[{n}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono[a{n}]"); n += 1
silence(INTRO)
for k, p in PAUSE.items(): line(f"{VO}/{k}.mp3"); silence(p)
graph = ";".join(fc) + ";" + "".join(f"[a{i}]" for i in range(n)) + f"concat=n={n}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=7,aformat=channel_layouts=stereo[out]"
voice = f"{B}/cut2/voice.m4a"
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-nostdin"] + args + ["-filter_complex", graph, "-map", "[out]", "-ar", "44100", "-c:a", "aac", "-b:a", "192k", voice], check=True)
final = f"{B}/cut2/AIGO_cut_v2.mp4"
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-nostdin", "-i", f"{B}/cut2/picture.mp4", "-i", voice, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "copy", "-shortest", final], check=True)
print(json.dumps({"picture_s": round(dur(f"{B}/cut2/picture.mp4"), 2), "voice_s": round(dur(voice), 2), "final_s": round(dur(final), 2)}))
