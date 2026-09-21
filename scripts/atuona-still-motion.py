#!/usr/bin/env python3
"""Atuona still-motion: turn a still image into a living film shot.

    python atuona-still-motion.py depth  <model.onnx> <out_dir> <img> [<img> ...]
    python atuona-still-motion.py render <spec.json>
    python atuona-still-motion.py probe  <spec.json> <t> <out.jpg>   # one frame, for review

How it works (the part a Ken Burns zoom does not do):
  1. A monocular depth model (Depth Anything V2, ONNX, CPU) estimates how NEAR
     every pixel is. Nothing leaves the server; no per-image API cost.
  2. A virtual camera moves (truck / dolly / slight roll). Each output pixel is
     reprojected through the depth map, so near pixels travel further than far
     ones -> real parallax, the picture reads as 3D space, not a flat zoom.
  3. Atmosphere is layered per shot so the frame never freezes: water shimmer,
     caustic light, rising bubbles, dust in light shafts, falling drips, smoke
     drift, lamp flicker, moving film grain.

Spec (render): {"out", "dur", "fps", "size":[w,h], "bg", "grain", "vignette",
  "wall":{"zoom":[a,b]}, "shots":[shot, ...]}
Shot: {"img", "depth", "crop":[x0,y0,x1,y1] (normalized, excludes watermarks /
  baked-in bars), "look":[[x,y],[x,y]], "zoom":[a,b], "truck":[[tx,ty],[tx,ty]]
  (px of parallax at nearest depth), "dolly": g, "focal": d, "rot":[deg,deg],
  "ease": e, "rect":[x,y,w,h] (panels), "fade_in":[t0,d], "inpaint":[[x0,y0,x1,y1]],
  "fx":[{...}]}
"""
import json
import math
import os
import subprocess
import sys

import cv2
import numpy as np

MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)


# ----------------------------------------------------------------------------- depth
def depth_maps(model, out_dir, imgs):
    import onnxruntime as ort
    os.makedirs(out_dir, exist_ok=True)
    sess = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
    for path in imgs:
        name = os.path.splitext(os.path.basename(path))[0]
        out = os.path.join(out_dir, name + ".png")
        if os.path.exists(out):
            print("cached", out)
            continue
        bgr = cv2.imread(path, cv2.IMREAD_COLOR)
        h, w = bgr.shape[:2]
        s = 518.0 / min(h, w)
        W = max(14, int(round(w * s / 14.0)) * 14)
        H = max(14, int(round(h * s / 14.0)) * 14)
        rgb = cv2.cvtColor(cv2.resize(bgr, (W, H), interpolation=cv2.INTER_CUBIC), cv2.COLOR_BGR2RGB)
        x = ((rgb.astype(np.float32) / 255.0 - MEAN) / STD).transpose(2, 0, 1)[None]
        d = sess.run(None, {"pixel_values": x})[0][0].astype(np.float32)
        lo, hi = np.percentile(d, 0.5), np.percentile(d, 99.5)
        d = np.clip((d - lo) / max(hi - lo, 1e-6), 0, 1)
        cv2.imwrite(out, (d * 65535).astype(np.uint16))
        print("depth", out, d.shape)


# ----------------------------------------------------------------------------- helpers
def ease(u, e):
    u = min(max(u, 0.0), 1.0)
    return (1 - e) * u + e * (u * u * (3 - 2 * u))


def lerp(a, b, u):
    return a + (b - a) * u


def lerp2(a, b, u):
    return (lerp(a[0], b[0], u), lerp(a[1], b[1], u))


def hex_bgr(h):
    h = h.lstrip("#")
    return (int(h[4:6], 16), int(h[2:4], 16), int(h[0:2], 16))


def soft_mask(shape_hw, spec):
    """Mask in SOURCE pixel space from normalized shapes:
       {"ellipse":[cx,cy,rx,ry]} | {"rect":[x0,y0,x1,y1]} , "feather": f (normalized)."""
    h, w = shape_hw
    m = np.zeros((h, w), np.float32)
    shapes = spec if isinstance(spec, list) else [spec]
    for sh in shapes:
        f = sh.get("feather", 0.05)
        if "ellipse" in sh:
            cx, cy, rx, ry = sh["ellipse"]
            cv2.ellipse(m, (int(cx * w), int(cy * h)), (max(1, int(rx * w)), max(1, int(ry * h))),
                        sh.get("angle", 0), 0, 360, 1.0, -1, cv2.LINE_AA)
        elif "rect" in sh:
            x0, y0, x1, y1 = sh["rect"]
            cv2.rectangle(m, (int(x0 * w), int(y0 * h)), (int(x1 * w), int(y1 * h)), 1.0, -1)
        k = max(1, int(f * max(h, w)))
        m = cv2.GaussianBlur(m, (0, 0), k)
    return np.clip(m, 0, 1)


class Noise1D:
    """Smooth random signal in [-1, 1] (sum of detuned sines) - flicker, sway."""

    def __init__(self, seed, speed=1.0):
        r = np.random.RandomState(seed)
        self.f = r.uniform(0.3, 1.6, 4) * speed
        self.p = r.uniform(0, 2 * np.pi, 4)
        self.a = np.array([0.45, 0.3, 0.15, 0.1])

    def __call__(self, t):
        return float(np.sum(self.a * np.sin(2 * np.pi * self.f * t + self.p)))


# ----------------------------------------------------------------------------- one shot
class Shot:
    def __init__(self, spec, out_w, out_h, dur, base_dir, seed=1):
        self.spec, self.w, self.h, self.dur = spec, out_w, out_h, dur
        img = cv2.imread(os.path.join(base_dir, spec["img"]), cv2.IMREAD_COLOR)
        if img is None:
            raise SystemExit("cannot read " + spec["img"])
        H, W = img.shape[:2]
        for (x0, y0, x1, y1) in spec.get("inpaint", []):
            mk = np.zeros((H, W), np.uint8)
            cv2.rectangle(mk, (int(x0 * W), int(y0 * H)), (int(x1 * W), int(y1 * H)), 255, -1)
            img = cv2.inpaint(img, mk, 5, cv2.INPAINT_TELEA)
        self.img = img.astype(np.float32)
        self.H, self.W = H, W

        # depth: nearness in [0,1]; dilate the foreground so silhouettes carry their
        # own edge (the background stretches instead of the subject tearing), then soften
        d = cv2.imread(os.path.join(base_dir, spec["depth"]), cv2.IMREAD_UNCHANGED).astype(np.float32) / 65535.0
        d = cv2.resize(d, (W, H), interpolation=cv2.INTER_CUBIC)
        k = max(3, int(0.006 * W) | 1)
        d = cv2.dilate(d, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
        d = cv2.GaussianBlur(d, (0, 0), max(1.0, 0.004 * W))
        self.depth = np.clip(d, 0, 1)

        c = spec.get("crop", [0, 0, 1, 1])
        self.X0, self.Y0, self.X1, self.Y1 = c[0] * W, c[1] * H, c[2] * W, c[3] * H
        self.s0 = min((self.X1 - self.X0) / out_w, (self.Y1 - self.Y0) / out_h)

        ys, xs = np.mgrid[0:out_h, 0:out_w].astype(np.float32)
        self.px, self.py = xs - out_w / 2.0, ys - out_h / 2.0
        self.rng = np.random.RandomState(seed)
        self.fx = []
        for f in spec.get("fx", []):
            f = dict(f)
            if "mask" in f:
                f["_mask"] = soft_mask((H, W), f["mask"])
            f["_n"] = Noise1D(self.rng.randint(1 << 30), f.get("speed", 1.0))
            if f["type"] in ("dust", "bubbles", "drips"):
                f["_p"] = self._spawn(f)
            self.fx.append(f)

    # particles live in output-normalized space with their own depth
    def _spawn(self, f):
        n = int(f.get("count", 80))
        r = self.rng
        region = f.get("region", [0, 0, 1, 1])
        return {
            "x": r.uniform(region[0], region[2], n), "y": r.uniform(region[1], region[3], n),
            "z": r.uniform(0.2, 1.0, n), "ph": r.uniform(0, 2 * np.pi, n),
            "v": r.uniform(0.6, 1.4, n), "region": region,
        }

    def camera(self, t):
        sp = self.spec
        u = ease(t / max(self.dur, 1e-6), sp.get("ease", 0.55))
        z = lerp(*sp.get("zoom", [1.0, 1.06]), u)
        s = self.s0 / z
        look = sp.get("look", [[0.5, 0.5], [0.5, 0.5]])
        lx, ly = lerp2(look[0], look[1], u)
        Lx, Ly = lx * self.W, ly * self.H
        # keep the window (plus a parallax margin) inside the usable crop
        mx = s * self.w / 2 * 1.02 + 6 * s
        my = s * self.h / 2 * 1.02 + 6 * s
        Lx = min(max(Lx, self.X0 + mx), self.X1 - mx) if self.X1 - self.X0 > 2 * mx else (self.X0 + self.X1) / 2
        Ly = min(max(Ly, self.Y0 + my), self.Y1 - my) if self.Y1 - self.Y0 > 2 * my else (self.Y0 + self.Y1) / 2
        tr = sp.get("truck", [[0, 0], [0, 0]])
        tx, ty = lerp2(tr[0], tr[1], u)
        th = math.radians(lerp(*sp.get("rot", [0, 0]), u))
        g = sp.get("dolly", 0.0) * u
        return s, Lx, Ly, tx, ty, th, g

    def frame(self, t):
        s, Lx, Ly, tx, ty, th, g = self.camera(t)
        focal = self.spec.get("focal", 0.0)
        c, sn = math.cos(th), math.sin(th)
        px, py = self.px, self.py

        # output-space displacement (water shimmer, smoke flow) before reprojection
        dx = np.zeros_like(px)
        dy = np.zeros_like(py)
        q0x = Lx + s * (c * px + sn * py)
        q0y = Ly + s * (-sn * px + c * py)
        for f in self.fx:
            if f["type"] == "shimmer":
                a = f.get("amp", 1.4)
                k1, k2 = 2 * np.pi / f.get("wl", 140), 2 * np.pi / (f.get("wl", 140) * 1.7)
                w1 = 2 * np.pi / f.get("period", 4.0)
                sx = a * np.sin(k1 * py + w1 * t) * np.cos(k2 * px - 0.7 * w1 * t)
                sy = 0.6 * a * np.sin(k2 * px + 0.8 * w1 * t + 1.3) * np.cos(k1 * 0.8 * py - w1 * t)
                if "_mask" in f:
                    mk = cv2.remap(f["_mask"], q0x, q0y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
                    sx, sy = sx * mk, sy * mk
                dx += sx
                dy += sy
            elif f["type"] == "flow":  # smoke / mist drifting upward with turbulence
                a = f.get("amp", 4.0)
                rise = f.get("rise", 18.0) * t
                k = 2 * np.pi / f.get("wl", 90)
                fx_ = a * np.sin(k * (py + rise) + 1.7 * np.sin(k * 0.6 * px + 0.9 * t))
                fy_ = 0.8 * a * np.sin(k * 0.8 * px + 1.3 * np.cos(k * 0.5 * (py + rise))) - 0.35 * a
                mk = cv2.remap(f["_mask"], q0x, q0y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE) if "_mask" in f else 1.0
                dx += fx_ * mk
                dy += fy_ * mk
        ppx, ppy = px + dx, py + dy

        # 2.5D reprojection (fixed-point: depth is a function of the SOURCE position)
        mapx, mapy = q0x, q0y
        for _ in range(3):
            d = cv2.remap(self.depth, mapx, mapy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            m = 1.0 + g * d
            ax = (ppx - tx * (d - focal)) / m
            ay = (ppy - ty * (d - focal)) / m
            mapx = Lx + s * (c * ax + sn * ay)
            mapy = Ly + s * (-sn * ax + c * ay)
        out = cv2.remap(self.img, mapx, mapy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)

        # light effects in output space
        lum = None
        for f in self.fx:
            typ = f["type"]
            mk = None
            if "_mask" in f and typ not in ("shimmer", "flow"):
                mk = cv2.remap(f["_mask"], mapx, mapy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            if typ == "flicker":  # lamp / screen breathing
                v = 1.0 + f.get("amp", 0.03) * f["_n"](t)
                out *= (1 + (v - 1) * mk)[..., None] if mk is not None else v
            elif typ == "caustics":
                sw, sh = self.w // 4, self.h // 4
                yy, xx = np.mgrid[0:sh, 0:sw].astype(np.float32)
                xx, yy = xx * 4 + tx * 0.3, yy * 4 + ty * 0.3
                k = 2 * np.pi / f.get("wl", 110)
                w1 = 2 * np.pi / f.get("period", 5.0)
                wx = xx + 18 * np.sin(yy * 0.021 + t * 0.7)
                wy = yy + 18 * np.sin(xx * 0.017 - t * 0.6)
                pat = (np.sin(k * wx + w1 * t) + np.sin(k * (0.5 * wx + 0.866 * wy) - 1.1 * w1 * t)
                       + np.sin(k * (-0.5 * wx + 0.866 * wy) + 0.8 * w1 * t))
                pat = np.clip(1.0 - np.abs(pat) / 1.6, 0, 1) ** f.get("sharp", 5)
                pat = cv2.resize(pat, (self.w, self.h), interpolation=cv2.INTER_CUBIC)
                if mk is not None:
                    pat = pat * mk
                out *= (1.0 + f.get("amp", 0.12) * pat)[..., None]
            elif typ in ("dust", "bubbles", "drips"):
                if lum is None:
                    lum = cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
                self._particles(out, f, t, tx, ty, focal, lum, mk)
        return out

    def _particles(self, out, f, t, tx, ty, focal, lum, mk):
        P = f["_p"]
        typ = f["type"]
        region = P["region"]
        rw, rh = region[2] - region[0], region[3] - region[1]
        color = np.array(hex_bgr(f.get("color", "#fff4e0")), np.float32)
        layer = np.zeros((self.h, self.w), np.float32)
        vx, vy = f.get("vel", [0.004, -0.012] if typ != "drips" else [0.0, 0.9])
        for i in range(len(P["x"])):
            z, v, ph = P["z"][i], P["v"][i], P["ph"][i]
            x = P["x"][i] + vx * v * t * (0.5 + z) + 0.006 * math.sin(0.7 * t + ph) * (typ != "drips")
            y = P["y"][i] + vy * v * t * (0.5 + z)
            x = region[0] + (x - region[0]) % rw
            y = region[1] + (y - region[1]) % rh
            X = x * self.w + tx * (z - focal)
            Y = y * self.h + ty * (z - focal)
            if not (0 <= X < self.w and 0 <= Y < self.h):
                continue
            gate = 1.0
            if f.get("light_gated", True):
                L = lum[int(Y), int(X)]
                lo, hi = f.get("gate", [0.18, 0.55])
                gate = min(max((L - lo) / (hi - lo), 0.0), 1.0)
            if mk is not None:
                gate *= mk[int(Y), int(X)]
            if gate <= 0.02:
                continue
            tw = 0.65 + 0.35 * math.sin(2.3 * t * v + ph)
            b = f.get("amp", 0.8) * gate * tw * (0.45 + 0.55 * z)
            r = f.get("size", 1.6) * (0.5 + z)
            if typ == "drips":
                ln = f.get("len", 14) * (0.5 + z)
                cv2.line(layer, (int(X), int(Y - ln)), (int(X), int(Y)), b, max(1, int(r * 0.6)), cv2.LINE_AA)
            elif typ == "bubbles":
                cv2.circle(layer, (int(X), int(Y)), max(1, int(r)), b * 0.8, 1, cv2.LINE_AA)
                cv2.circle(layer, (int(X - r * 0.35), int(Y - r * 0.35)), max(1, int(r * 0.35)), b, -1, cv2.LINE_AA)
            else:
                cv2.circle(layer, (int(X), int(Y)), max(1, int(round(r))), b, -1, cv2.LINE_AA)
        layer = cv2.GaussianBlur(layer, (0, 0), f.get("soft", 0.9))
        out += layer[..., None] * color[None, None, :]


# ----------------------------------------------------------------------------- compositor
class Film:
    def __init__(self, spec, base_dir):
        self.spec = spec
        self.w, self.h = spec.get("size", [1280, 720])
        self.dur, self.fps = spec["dur"], spec.get("fps", 30)
        self.bg = np.array(hex_bgr(spec.get("bg", "#0b0b0c")), np.float32)
        self.shots = []
        for i, sh in enumerate(spec["shots"]):
            rect = sh.get("rect", [0, 0, self.w, self.h])
            self.shots.append((Shot(sh, rect[2], rect[3], self.dur, base_dir, seed=11 + i), rect))
        r = np.random.RandomState(7)
        g = r.normal(0, 1, (6, self.h, self.w)).astype(np.float32)
        self.grain = np.stack([cv2.GaussianBlur(x, (0, 0), 0.7) for x in g])
        self.grain /= self.grain.std()
        ys, xs = np.mgrid[0:self.h, 0:self.w].astype(np.float32)
        rr = np.sqrt(((xs - self.w / 2) / (self.w / 2)) ** 2 + ((ys - self.h / 2) / (self.h / 2)) ** 2) / math.sqrt(2)
        self.vig = (1.0 - spec.get("vignette", 0.18) * np.clip(rr, 0, 1) ** 2.2)[..., None]
        self.rng = r

    def frame(self, t):
        full = len(self.shots) == 1 and self.shots[0][1][2] == self.w and self.shots[0][1][3] == self.h
        if full:
            canvas = self.shots[0][0].frame(t)
        else:
            canvas = np.empty((self.h, self.w, 3), np.float32)
            canvas[:] = self.bg
            for shot, (x, y, w, h) in self.shots:
                fi = shot.spec.get("fade_in", [0, 0])
                a = 1.0 if fi[1] <= 0 else min(max((t - fi[0]) / fi[1], 0.0), 1.0)
                if a <= 0:
                    continue
                a = a * a * (3 - 2 * a)
                canvas[y:y + h, x:x + w] = canvas[y:y + h, x:x + w] * (1 - a) + shot.frame(t) * a
            wz = self.spec.get("wall", {}).get("zoom")
            if wz:
                z = lerp(wz[0], wz[1], ease(t / self.dur, 0.5))
                M = cv2.getRotationMatrix2D((self.w / 2, self.h / 2), 0, z)
                canvas = cv2.warpAffine(canvas, M, (self.w, self.h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        canvas *= self.vig
        gi = self.grain[self.rng.randint(len(self.grain))]
        gi = np.roll(gi, (self.rng.randint(self.h), self.rng.randint(self.w)), axis=(0, 1))
        canvas += gi[..., None] * (self.spec.get("grain", 0.03) * 255)
        return np.clip(canvas, 0, 255).astype(np.uint8)

    def render(self, out):
        n = int(round(self.dur * self.fps))
        cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{self.w}x{self.h}",
               "-r", str(self.fps), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "17",
               "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]
        p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        for i in range(n):
            p.stdin.write(self.frame(i / self.fps).tobytes())
        p.stdin.close()
        if p.wait() != 0:
            raise SystemExit("ffmpeg failed for " + out)
        print("rendered", out, n, "frames")


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    cmd = sys.argv[1]
    if cmd == "depth":
        depth_maps(sys.argv[2], sys.argv[3], sys.argv[4:])
    elif cmd in ("render", "probe"):
        spec_path = sys.argv[2]
        spec = json.load(open(spec_path))
        base = spec.get("base_dir", os.path.dirname(os.path.abspath(spec_path)))
        film = Film(spec, base)
        if cmd == "render":
            film.render(spec["out"])
        else:
            cv2.imwrite(sys.argv[4], film.frame(float(sys.argv[3])), [cv2.IMWRITE_JPEG_QUALITY, 92])
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
