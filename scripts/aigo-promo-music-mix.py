# AI Growth Operator promo - lay the chosen Pixabay track under the MiniMax narration. Runs on Oracle in ~/aigo-promo.
# usage: python3 aigo-promo-music-mix.py <music.mp3> [start_s=0] [out=cut3/AIGO_cut_v3.mp4] [picture=cut2/picture.mp4]
# The voice stays king: the bed is sidechain-ducked by the narration (drops ~10 dB while he speaks, breathes back up in
# the pauses and under the end card), fades in over 1 s, fades out over the last 3 s of picture. Voice and bed are both
# apad-ed to the picture length, so a short track or a short voice file can never cut the picture.
import os, sys, subprocess, json
B = os.path.expanduser("~/aigo-promo")
music = sys.argv[1]
start = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0
final = os.path.join(B, sys.argv[3] if len(sys.argv) > 3 else "cut3/AIGO_cut_v3.mp4")
picture = os.path.join(B, sys.argv[4] if len(sys.argv) > 4 else "cut2/picture.mp4")
voice = os.path.join(B, "cut2/voice.m4a")
os.makedirs(os.path.dirname(final), exist_ok=True)
dur = lambda p: float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout)
T = dur(picture)
# Bed level is MEASURED, not a fixed gain: Pixabay masters differ by 8 dB (BerryDeep -8.7 LUFS, Rockot -16.7), so a fixed
# -17 dB left the quiet master near-inaudible. -25.7 LUFS = the bed level of cut v3 that passed the balance check.
BED_LUFS = -25.7
meas = subprocess.run(["ffmpeg", "-nostdin", "-ss", str(start), "-t", f"{T:.3f}", "-i", music, "-af", "ebur128", "-f", "null", "-"],
                      capture_output=True, text=True).stderr
music_lufs = float(meas.rsplit("I:", 1)[1].split("LUFS")[0])
BED_DB = round(BED_LUFS - music_lufs, 2)
graph = (
    f"[1:a]aresample=44100,aformat=channel_layouts=stereo,apad=whole_dur={T},atrim=duration={T},asplit=2[v][vkey];"
    f"[2:a]aresample=44100,aformat=channel_layouts=stereo,atrim=start={start},asetpts=PTS-STARTPTS,"
    f"apad=whole_dur={T},atrim=duration={T},volume={BED_DB}dB,"
    f"afade=t=in:st=0:d=1,afade=t=out:st={T-3:.2f}:d=3[bed];"
    f"[bed][vkey]sidechaincompress=threshold=0.02:ratio=8:attack=80:release=700:makeup=1[ducked];"
    f"[v][ducked]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.89[out]"
)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-nostdin", "-i", picture, "-i", voice, "-i", music,
                "-filter_complex", graph, "-map", "0:v", "-map", "[out]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                "-t", f"{T:.3f}", final], check=True)
print(json.dumps({"picture_s": round(T, 2), "music_s": round(dur(music), 2), "start_s": start, "music_lufs": music_lufs, "bed_gain_db": BED_DB, "final_s": round(dur(final), 2), "file": final}))
