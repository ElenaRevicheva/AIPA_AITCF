"""Measure a music track instead of trusting its prompt: tempo (onset autocorrelation), low-end share, and kick regularity.
in: raw mono s16le at 11025 Hz (ffmpeg -ac 1 -ar 11025 -f s16le)."""
import sys, numpy as np
sr = 11025
x = np.frombuffer(open(sys.argv[1], 'rb').read(), dtype=np.int16).astype(np.float32) / 32768
print(f'length {len(x)/sr:.1f}s  rms {np.sqrt(np.mean(x**2)):.3f}')
hop, win = 256, 1024
frames = np.lib.stride_tricks.sliding_window_view(x, win)[::hop] * np.hanning(win)
S = np.abs(np.fft.rfft(frames, axis=1))
f = np.fft.rfftfreq(win, 1 / sr)
low = S[:, (f > 30) & (f < 150)].sum(1)
print(f'energy below 150 Hz: {100 * (S[:, f < 150]**2).sum() / (S**2).sum():.0f}%')
def tempo(env):
    env = np.maximum(np.diff(env), 0); env -= env.mean()
    ac = np.correlate(env, env, 'full')[len(env) - 1:]
    fps = sr / hop
    lags = np.arange(len(ac)); bpm = 60 * fps / np.maximum(lags, 1)
    m = (bpm > 70) & (bpm < 180)
    k = lags[m][np.argmax(ac[m])]
    return 60 * fps / k, ac[k] / ac[0]
for a, b in [(0, 60), (60, 120), (120, 180), (180, 240), (240, 300)]:
    seg = low[int(a * sr / hop): int(b * sr / hop)]
    if len(seg) > 100:
        t, strength = tempo(seg)
        print(f'{a:3d}-{b:3d}s  kick-band tempo {t:6.1f} BPM  pulse strength {strength:.2f}')
