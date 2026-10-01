# AI Growth Operator promo - CUT v4 design assets (Elena's v3.1 review, 1 Oct 2026). Runs LOCALLY (Pillow); output is
# scp'd to Oracle ~/aigo-promo/v4/ and assembled by aigo-promo-cut4.py.
#  - captions: "ugly" glass pills -> brand type: Instrument Serif, the key phrase in gold italic (the /api hero look), soft halo
#  - every real screen: SPLIT frame - the phone/page on the left, a big QR on the right ("half screenshot, half QR")
#  - B9 morning line: English kinetic words in brand style (who's new / warm / slipping away) + Spanish mono labels
#  - end card: split, the QR as large as the headline; reveal card: transparent, laid over the real Bocas del Toro sunset
# usage: python aigo-promo-v4-assets.py <fonts+logo+qr dir> <safe screenshots dir> <out dir>
import json, os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FD, SAFE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
W, H = 1920, 1080
BG, GOLD, VIOLET, WHITE = (3, 7, 17), (237, 184, 103), (157, 140, 255), (255, 255, 255)
SERIF, ITALIC, MONO = f"{FD}/InstrumentSerif-Regular.ttf", f"{FD}/InstrumentSerif-Italic.ttf", "C:/Windows/Fonts/consola.ttf"

def font(p, s): return ImageFont.truetype(p, s)
def manrope(s, wt=b"SemiBold"):
    f = ImageFont.truetype(f"{FD}/Manrope-var.ttf", s); f.set_variation_by_name(wt); return f
def tw(f, t): return f.getbbox(t)[2] if t else 0
def layer(): return Image.new("RGBA", (W, H), (0, 0, 0, 0))
def comp(im, draw_fn):
    # ImageDraw REPLACES alpha on RGBA; translucent marks are drawn on their own layer and composited
    l = layer(); draw_fn(ImageDraw.Draw(l)); im.alpha_composite(l)

def spaced(d, x, y, text, f, fill, track):
    for ch in text: d.text((x, y), ch, font=f, fill=fill); x += tw(f, ch) + track
def spaced_w(f, text, track): return sum(tw(f, c) + track for c in text) - track
def runs_w(runs): return sum(tw(f, t) for t, f, _ in runs)
def draw_runs(d, x, y, runs):
    for t, f, c in runs: d.text((x, y), t, font=f, fill=c); x += tw(f, t)

def halo_runs(im, x, y, runs, blur=10, alpha=200):
    sh = layer(); draw_runs(ImageDraw.Draw(sh), x + 2, y + 4, [(t, f, (0, 0, 0, alpha)) for t, f, _ in runs])
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur))); draw_runs(ImageDraw.Draw(im), x, y, runs)

def backdrop():
    im = Image.new("RGBA", (W, H), BG + (255,))
    g = layer(); gd = ImageDraw.Draw(g)
    gd.ellipse((-500, -650, 1100, 750), fill=VIOLET + (46,)); gd.ellipse((1150, 520, 2450, 1650), fill=GOLD + (24,))
    im.alpha_composite(g.filter(ImageFilter.GaussianBlur(190)))
    comp(im, lambda d: [d.ellipse((x - 1.2, y - 1.2, x + 1.2, y + 1.2), fill=(255, 255, 255, 34)) for y in range(15, H, 30) for x in range(15, W, 30)])
    return im

def qr_plate(size, pad=26, radius=30):
    plate = Image.new("RGBA", (size + 2 * pad, size + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(plate).rounded_rectangle((0, 0, plate.width - 1, plate.height - 1), radius, fill=(255, 255, 255, 255))
    plate.alpha_composite(Image.open(f"{FD}/brand_qr.png").convert("RGBA").resize((size, size), Image.LANCZOS), (pad, pad))
    return plate
def shadowed_paste(im, sprite, x, y, blur=22, alpha=170, dy=14):
    sh = layer(); m = sprite.split()[3].point(lambda a: alpha if a > 0 else 0)
    sh.paste(Image.new("RGBA", sprite.size, (0, 0, 0, 255)), (x, y + dy), m); im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur)))
    im.alpha_composite(sprite, (x, y))

def qr_block(im, cx, top, size, eyebrow="ESCANEA · AUDITORÍA GRATIS", url=True):
    d = ImageDraw.Draw(im); m = font(MONO, 24)
    spaced(d, cx - spaced_w(m, eyebrow, 6) // 2, top, eyebrow, m, GOLD, 6)
    p = qr_plate(size); shadowed_paste(im, p, cx - p.width // 2, top + 52)
    y = top + 52 + p.height + 30
    if url:
        f = manrope(46, b"Bold"); d.text((cx - tw(f, "aideazz.xyz/api") // 2, y), "aideazz.xyz/api", font=f, fill=WHITE)
    return y

def rounded(img, radius):
    img = img.convert("RGBA"); mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, img.width - 1, img.height - 1), radius, fill=255); img.putalpha(mask); return img

def fit(img, maxw, maxh):
    s = min(maxw / img.width, maxh / img.height); return img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)

L = {"cx": 560, "top": 60, "maxw": 860, "maxh": 840}          # left zone for a phone screen (bottom stays clear for captions)
manifest = {"layout": {}, "captions": [], "titles": [], "kinetic": [], "scrim": None}

# ---------- split frames for every real phone screen ----------
for f in sorted(os.listdir(SAFE)):
    if not f.startswith("safe_S") or f.startswith("safe_S9") or f.startswith("safe_S2_"): continue
    im = backdrop(); qr_block(im, 1400, 170, 470)
    ph = rounded(fit(Image.open(f"{SAFE}/{f}").convert("RGB"), L["maxw"], L["maxh"]), 34)
    shadowed_paste(im, ph, L["cx"] - ph.width // 2, L["top"] + (L["maxh"] - ph.height) // 2)
    im.convert("RGB").save(f"{OUT}/split_{f[5:-4]}.png")

# S2 (Elena, 1 Oct: "fill the space around the little WhatsApp"): her REAL HubSpot deals list as the base (Fresh today / ACTIVE /
# AGING views; "HIRING" tab + her name in a stage label blurred), the guest's WhatsApp message floating over it - the lead lands.
im = backdrop(); qr_block(im, 1400, 170, 470)
hub = rounded(fit(Image.open(f"{SAFE}/hub_deals_list.jpg").convert("RGB"), 980, 600), 22)
shadowed_paste(im, hub, 70, 130)
wa = rounded(fit(Image.open(f"{SAFE}/safe_S2_whatsapp.jpg").convert("RGB"), 700, 400), 28)
shadowed_paste(im, wa, 70 + hub.width - wa.width + 40, 130 + hub.height - 70, blur=26, alpha=200, dy=18)
im.convert("RGB").save(f"{OUT}/split_S2_whatsapp.png")

# panels with an empty left zone, for the two VIDEO screens (filled by ffmpeg) + their rounded-corner masks
rw, rh = round(864 * 840 / 1610), 840                                     # ChatGPT recording, status + nav bars cropped
im = backdrop(); qr_block(im, 1400, 170, 470)
shadowed_paste(im, rounded(Image.new("RGB", (rw, rh), (12, 16, 28)), 34), L["cx"] - rw // 2, L["top"])   # the video sits on this
im.convert("RGB").save(f"{OUT}/panel_phone.png")
Image.new("L", (rw, rh), 0).save(f"{OUT}/_tmp.png"); m = Image.new("L", (rw, rh), 0)
ImageDraw.Draw(m).rounded_rectangle((0, 0, rw - 1, rh - 1), 34, fill=255); m.save(f"{OUT}/mask_rec.png"); os.remove(f"{OUT}/_tmp.png")
manifest["layout"]["rec"] = {"w": rw, "h": rh, "x": L["cx"] - rw // 2, "y": L["top"]}
aw, ah = 1080, 608                                                        # the live audit page, centre column
im = backdrop(); qr_block(im, 1545, 210, 380)
shadowed_paste(im, rounded(Image.new("RGB", (aw, ah), (12, 16, 28)), 24), 70, 150)
im.convert("RGB").save(f"{OUT}/panel_wide.png")
m = Image.new("L", (aw, ah), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, aw - 1, ah - 1), 24, fill=255); m.save(f"{OUT}/mask_audit.png")
manifest["layout"]["audit"] = {"w": aw, "h": ah, "x": 70, "y": 150}

# ---------- B9: HubSpot on the left, the morning words + QR on the right ----------
im = backdrop()
ph = rounded(fit(Image.open(f"{SAFE}/safe_S9_hubspot_deal.jpg").convert("RGB"), 700, 960), 34)
shadowed_paste(im, ph, 520 - ph.width // 2, 60)
p = qr_plate(250); shadowed_paste(im, p, 1480 - p.width // 2, 700)
f = manrope(34, b"Bold"); ImageDraw.Draw(im).text((1480 - tw(f, "aideazz.xyz/api") // 2, 1000), "aideazz.xyz/api", font=f, fill=WHITE)
im.convert("RGB").save(f"{OUT}/split_S9_hubspot_deal.png")
KX = 1000
def kinetic(fn, runs, label, y):
    k = layer(); lab = font(MONO, 22)
    halo_runs(k, KX, y, runs, blur=8, alpha=160)
    spaced(ImageDraw.Draw(k), KX + 4, y + 124, label, lab, (175, 180, 196), 5)
    bb = k.getbbox(); k.crop(bb).save(f"{OUT}/{fn}"); return bb
ks = 92; s, it = font(SERIF, ks), font(ITALIC, ks)
eb = layer(); spaced(ImageDraw.Draw(eb), KX + 4, 70, "EVERY MORNING", font(MONO, 26), GOLD, 8); ebb = eb.getbbox(); eb.crop(ebb).save(f"{OUT}/kin_0.png")
rows = [("kin_1.png", [("Who's ", s, WHITE), ("new.", it, WHITE)], "QUIÉN ES NUEVO", 120, 1.05),
        ("kin_2.png", [("Who's ", s, WHITE), ("warm.", it, GOLD)], "QUIÉN ESTÁ INTERESADO", 300, 2.18),
        ("kin_3.png", [("Who's ", s, WHITE), ("slipping away.", it, VIOLET)], "QUIÉN SE TE ESTÁ ESCAPANDO", 480, 3.05)]
manifest["kinetic"].append({"line": "s09", "t0": 0.0, "file": "kin_0.png", "x": ebb[0], "y": ebb[1]})
for fn, runs, label, y, t0 in rows:
    bb = kinetic(fn, runs, label, y); manifest["kinetic"].append({"line": "s09", "t0": t0, "file": fn, "x": bb[0], "y": bb[1]})

# ---------- cards ----------
def thesis():
    im = backdrop(); d = ImageDraw.Draw(im); s, it = font(SERIF, 112), font(ITALIC, 112)
    for y, runs in ((330, [("Nadie se despierta queriendo IA.", s, WHITE)]), (470, [("Tú quieres ", s, WHITE), ("más reservas.", it, GOLD)])):
        draw_runs(d, (W - runs_w(runs)) // 2, y, runs)
    d.rounded_rectangle((W // 2 - 190, 680, W // 2 - 30, 684), 2, fill=VIOLET); d.rounded_rectangle((W // 2 + 30, 680, W // 2 + 190, 684), 2, fill=GOLD)
    p = qr_plate(300); im.alpha_composite(p, (W - p.width - 70, H - p.height - 60)); return im.convert("RGB")
thesis().save(f"{OUT}/card_s04.png")

def reveal_overlay():
    # transparent: laid over the real Bocas del Toro sunset (no people -> QR on frame)
    im = layer()
    lg = Image.open(f"{FD}/brand_logo.png").convert("RGBA"); lg = lg.crop(lg.getbbox()); lg = lg.resize((600, round(lg.height * 600 / lg.width)), Image.LANCZOS)
    shadowed_paste(im, lg, (W - 600) // 2, 110, blur=30, alpha=120)
    s, it = font(SERIF, 86), font(ITALIC, 86)
    for y, runs in ((425, [("Las personas de esta película son IA.", s, WHITE)]), (528, [("Las pantallas del producto son ", s, WHITE), ("reales.", it, GOLD)])):
        halo_runs(im, (W - runs_w(runs)) // 2, y, runs, blur=14, alpha=220)
    m = font(MONO, 26); t = "HECHO EN NUESTRO PROPIO ESTUDIO DE CINE CON IA"
    sh = layer(); spaced(ImageDraw.Draw(sh), (W - spaced_w(m, t, 6)) // 2 + 2, 652, t, m, (0, 0, 0, 220), 6); im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(6)))
    spaced(ImageDraw.Draw(im), (W - spaced_w(m, t, 6)) // 2, 650, t, m, (235, 236, 242), 6)
    p = qr_plate(300); shadowed_paste(im, p, W - p.width - 70, H - p.height - 60); return im
reveal_overlay().save(f"{OUT}/reveal_s11.png")

def end_card():
    im = backdrop(); d = ImageDraw.Draw(im); CX = 640
    lg = Image.open(f"{FD}/brand_logo.png").convert("RGBA"); lg = lg.crop(lg.getbbox()); lg = lg.resize((470, round(lg.height * 470 / lg.width)), Image.LANCZOS)
    im.alpha_composite(lg, (CX - 235, 90))
    m = font(MONO, 22); t = "AI GROWTH OPERATOR · AIDEAZZ AI LAB"; spaced(d, CX - spaced_w(m, t, 6) // 2, 350, t, m, GOLD, 6)
    s, it = font(SERIF, 98), font(ITALIC, 98)
    for y, runs in ((392, [("¿Qué ve la IA cuando", s, WHITE)]), (494, [("mira ", s, WHITE), ("tu negocio?", it, GOLD)])):
        draw_runs(d, CX - runs_w(runs) // 2, y, runs)
    b = manrope(30, b"Medium"); t2 = "Auditoría de visibilidad en IA  ·  34 señales  ·  gratis"
    d.text((CX - tw(b, t2) // 2, 640), t2, font=b, fill=(229, 231, 235))
    f = manrope(50, b"Bold"); label, arrow = "aideazz.xyz/api", "  →"
    pw, ph = tw(f, label) + tw(f, arrow) + 110, 98; x0, y0 = CX - pw // 2, 712
    ring = Image.new("RGBA", (pw + 8, ph + 8)); rd = ImageDraw.Draw(ring)
    for i in range(pw + 8):
        k = i / (pw + 7); rd.line([(i, 0), (i, ph + 8)], fill=(round(255 - 31 * k), round(92 - 59 * k), round(53 + 85 * k), 255))   # HubSpot AI-bar ring
    mask = Image.new("L", ring.size, 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, pw + 7, ph + 7), (ph + 8) // 2, fill=255)
    im.paste(ring, (x0 - 4, y0 - 4), mask); d = ImageDraw.Draw(im)
    d.rounded_rectangle((x0, y0, x0 + pw, y0 + ph), ph // 2, fill=(11, 16, 32, 255))
    ty = y0 + (ph - (f.getbbox("Ag")[3] - f.getbbox("Ag")[1])) // 2 - f.getbbox("Ag")[1]
    d.text((x0 + 55, ty), label, font=f, fill=WHITE); d.text((x0 + 55 + tw(f, label), ty), arrow, font=f, fill=GOLD)
    n = manrope(22, b"Regular"); t3 = "Dramatización: personas generadas con IA."; d.text((CX - tw(n, t3) // 2, 1010), t3, font=n, fill=(140, 140, 150))
    qr_block(im, 1440, 140, 560, eyebrow="ESCANEA CON TU CÁMARA", url=False)
    return im.convert("RGB")
end_card().save(f"{OUT}/card_s12.png")

# ---------- captions: brand type, no box; *phrase* = gold italic accent ----------
CAPS = {
    "s01": [(0.05, 2.71, "Tu próxima clienta de chárter está planeando *a medianoche.*"),
            (2.71, 5.75, "No te está llamando. *Le está preguntando a una IA.*")],
    "s02": [(0.05, 2.45, "La IA sugiere los barcos *que puede entender.*"),
            (2.45, 5.90, "Si no entiende tu sitio web, *puede que no estés en la lista.*")],
    "s03": [(0.05, 1.81, "Algunos clientes *te escriben directamente.*"),
            (1.81, 3.42, "Viernes por la noche: *estás en el mar.*"),
            (3.42, 4.58, "Respondes *el lunes.*"),
            (4.58, 7.00, "Ella ya reservó *el barco que respondió primero.*")],
    "s05": [(0.20, 1.06, "*Rebobina.*"),
            (3.41, 6.40, "Esta vez tienes un *AI Growth Operator.*")],
    "s06": [(0.05, 3.88, "Primero, revisa qué puede entender realmente la IA *de tu sitio web.*"),
            (3.88, 6.33, "*34 señales.* Una puntuación."),
            (6.33, 8.00, "Las correcciones *que importan.*")],
    "s07": [(0.05, 2.70, "Cuando ella escribe, *recibe respuesta al instante.*"),
            (2.70, 5.60, "Y ya tienes una respuesta *redactada en tu teléfono.*")],
    "s08": [(0.05, 2.50, "La IA redacta. *Tú decides.*"),
            (2.50, 3.70, "Un toque: *enviado.*"),
            (3.70, 6.40, "Y la conversación queda *registrada en tu CRM.*")],
    "s10": [(0.05, 3.53, "AIdeazz AI Lab *no te vende otro CRM.*"),
            (3.53, 7.70, "Instalamos un AI Growth Operator *dentro de las herramientas que ya usas,*"),
            (7.70, 9.00, "*y lo operamos contigo.*")],
}
CS = 66; CR, CI = font(SERIF, CS), font(ITALIC, CS); MAXW, LH = 1180, 76   # centred, ends left of the corner QR (x>=1564)

def parse(markup):
    out, it_ = [], False
    for i, part in enumerate(markup.split("*")):
        for w_ in part.split(" "):
            if w_: out.append((w_, it_))
        it_ = not it_
    return out
def lines_of(words):
    lines, cur = [], []
    def width_of(ws): return sum(tw(CI if i else CR, w_ + " ") for w_, i in ws)
    for w_ in words:
        if cur and width_of(cur + [w_]) > MAXW: lines.append(cur); cur = [w_]
        else: cur.append(w_)
    lines.append(cur)
    if len(lines) == 2 and len(lines[1]) == 1 and len(lines[0]) > 2: lines = [lines[0][:-1], [lines[0][-1]] + lines[1]]
    return lines
def runs_of(line):
    runs = []
    for k, (w_, i) in enumerate(line):
        t = w_ + (" " if k < len(line) - 1 else ""); f, c = (CI, GOLD) if i else (CR, WHITE)
        if runs and runs[-1][1] is f: runs[-1] = (runs[-1][0] + t, f, c)
        else: runs.append((t, f, c))
    return runs

for key, chunks in CAPS.items():
    for n, (t0, t1, text) in enumerate(chunks):
        ls = lines_of(parse(text)); assert len(ls) <= 2, text
        im = layer(); y0 = H - 46 - len(ls) * LH
        for j, line in enumerate(ls):
            r = runs_of(line); halo_runs(im, (W - runs_w(r)) // 2, y0 + j * LH, r, blur=9, alpha=235)
        bb = im.getbbox(); im = im.crop(bb); fn = f"cap_{key}_{n}.png"; im.save(f"{OUT}/{fn}")
        manifest["captions"].append({"line": key, "t0": t0, "t1": t1, "file": fn, "x": bb[0], "y": bb[1], "text": text.replace("*", "")})

# one soft bottom scrim per spoken line, so the serif reads on bright water without a box
sc = Image.new("RGBA", (W, 330), (0, 0, 0, 0)); sd = ImageDraw.Draw(sc)
for y in range(330): sd.line([(0, y), (1500, y)], fill=(0, 0, 0, int(150 * (y / 329) ** 1.6)))   # stops short of the corner QR:
for x in range(1500, 1560):                                                                            # a dimmed QR failed to scan
    a = 1 - (x - 1500) / 60
    for y in range(330): sc.putpixel((x, y), (0, 0, 0, int(150 * (y / 329) ** 1.6 * a)))
sc.save(f"{OUT}/scrim.png"); manifest["scrim"] = {"file": "scrim.png", "x": 0, "y": H - 330}

# ---------- titles over footage: kept from v3 (glass card, upper-left, clear of faces) ----------
def title(fn, l1, l2, size, left=60, y=60):
    s, it = font(SERIF, size), font(ITALIC, size); r1, r2 = [(l1, s, WHITE)], [(l2, it, GOLD)]
    w_ = max(runs_w(r1), runs_w(r2)); px, py, gap = 64, 34, 10; cw, ch = w_ + 2 * px, 2 * size + gap + 2 * py + 18
    im = Image.new("RGBA", (cw + 60, ch + 60), (0, 0, 0, 0))
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((30, 38, 30 + cw, 38 + ch), 28, fill=(0, 0, 0, 140))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14))); ImageDraw.Draw(im).rounded_rectangle((30, 30, 30 + cw, 30 + ch), 28, fill=(9, 14, 30, 196))
    rim = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(rim).rounded_rectangle((30, 30, 30 + cw, 30 + ch), 28, outline=(255, 255, 255, 40), width=2); im.alpha_composite(rim)
    d = ImageDraw.Draw(im)
    for k, runs in enumerate((r1, r2)): draw_runs(d, 30 + (cw - runs_w(runs)) // 2, 30 + py - size // 8 + k * (size + gap), runs)
    im.save(f"{OUT}/{fn}"); return {"file": fn, "x": left, "y": y}
manifest["titles"].append({"line": "s03", "t0": 6.10, "t1": None, **title("title_s03.png", "Las buenas oportunidades", "se enfrían en silencio.", 80)})
def title_question(fn, size=64, left=56, y=56):
    # Elena, 1 Oct: next to "Misma pregunta" show the question to ChatGPT, clearly - the user bubble mirrors the real ChatGPT UI.
    # Two-line bubble keeps the card narrow: the k_g2b push-in brings her face toward the upper-left.
    s, it = font(SERIF, size), font(ITALIC, size); r1, r2 = [("Misma clienta.", s, WHITE)], [("Misma pregunta a ChatGPT:", it, GOLD)]
    ql = ["¿Cuál es el mejor servicio de yates", "para ir a San Blas?"]; qf = manrope(30, b"Medium"); qlh = 40
    px, py, gap = 52, 30, 8; bw, bh = max(tw(qf, l) for l in ql) + 56, len(ql) * qlh + 30
    cw = max(runs_w(r1), runs_w(r2), bw) + 2 * px; ch = 2 * size + gap + 26 + bh + 2 * py + 10
    im = Image.new("RGBA", (cw + 60, ch + 60), (0, 0, 0, 0))
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((30, 38, 30 + cw, 38 + ch), 28, fill=(0, 0, 0, 140))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14))); ImageDraw.Draw(im).rounded_rectangle((30, 30, 30 + cw, 30 + ch), 28, fill=(9, 14, 30, 200))
    rim = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(rim).rounded_rectangle((30, 30, 30 + cw, 30 + ch), 28, outline=(255, 255, 255, 40), width=2); im.alpha_composite(rim)
    d = ImageDraw.Draw(im); x0 = 30 + px
    draw_runs(d, x0, 30 + py - size // 8, r1); draw_runs(d, x0, 30 + py - size // 8 + size + gap, r2)
    by = 30 + py + 2 * size + gap + 22
    d.rounded_rectangle((x0, by, x0 + bw, by + bh), 26, fill=(244, 244, 244, 255))
    for k, l in enumerate(ql): d.text((x0 + 28, by + 12 + k * qlh), l, font=qf, fill=(20, 20, 24))
    im.save(f"{OUT}/{fn}"); return {"file": fn, "x": left, "y": y}
manifest["titles"].append({"line": "s05", "t0": 1.10, "t1": 5.60, **title_question("title_s05.png")})

# ---------- opening title (Elena, 1 Oct): the film's name, large, on the very first shot ----------
# Left-aligned: through the 3.6 s push-in she sits centre/right, the left (curtain, dark window) stays clear.
def opening():
    im = layer()
    sc_ = Image.new("L", (W, H), 0); sd_ = ImageDraw.Draw(sc_)
    for x in range(1150): sd_.line([(x, 0), (x, H)], fill=int(175 * (1 - x / 1150) ** 1.4))
    im.paste(Image.new("RGBA", (W, H), (2, 4, 10, 255)), (0, 0), sc_)
    X = 92; m = font(MONO, 24)
    spaced(ImageDraw.Draw(im), X + 4, 150, "AIDEAZZ AI LAB · AI GROWTH OPERATOR", m, GOLD, 6)
    s, it = font(SERIF, 112), font(ITALIC, 156)
    halo_runs(im, X, 196, [("She Asked ChatGPT", s, WHITE)], blur=12, alpha=210)
    halo_runs(im, X, 316, [("Before She Messaged", s, WHITE)], blur=12, alpha=210)
    halo_runs(im, X - 4, 418, [("Your Yacht", it, GOLD)], blur=14, alpha=220)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((X + 4, 628, X + 164, 632), 2, fill=VIOLET); d.rounded_rectangle((X + 204, 628, X + 364, 632), 2, fill=GOLD)
    return im
opening().save(f"{OUT}/title_open.png")
manifest["absolute"] = [{"a": 0.25, "z": 3.55, "file": "title_open.png", "x": 0, "y": 0}]

# ---------- ICP card (Elena's wording, 1 Oct): who the AI Growth Operator is for - over the sunset + Guna Yala drone (no people) ----------
ICP_ROWS = ["Chárter de yates y villas de lujo", "Turismo médico y cirugía estética", "Clínicas dentales — implantes y carillas", "Reubicación, visas e inmigración"]
ICP_CHIPS = ["Ventas de alto valor", "Clientes internacionales", "Conversaciones por WhatsApp"]
def icp_card(a0=64.55, z=68.75):
    X, Y, px = 60, 56, 54; rf = font(SERIF, 64); cf = manrope(26, b"SemiBold"); m = font(MONO, 24)
    chips_w = sum(tw(cf, c) + 56 for c in ICP_CHIPS) + 14 * (len(ICP_CHIPS) - 1)
    cw = max(max(tw(rf, r) for r in ICP_ROWS) + 46, chips_w) + 2 * px; ch = 64 + len(ICP_ROWS) * 80 + 24 + 54 + 46
    bg = layer(); sh = layer(); ImageDraw.Draw(sh).rounded_rectangle((X, Y + 8, X + cw, Y + ch + 8), 30, fill=(0, 0, 0, 150))
    bg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(16)))
    comp(bg, lambda d: d.rounded_rectangle((X, Y, X + cw, Y + ch), 30, fill=(9, 14, 30, 205)))
    comp(bg, lambda d: d.rounded_rectangle((X, Y, X + cw, Y + ch), 30, outline=(255, 255, 255, 42), width=2))
    spaced(ImageDraw.Draw(bg), X + px, Y + 34, "PARA NEGOCIOS COMO", m, GOLD, 7)
    bb = bg.getbbox(); bg.crop(bb).save(f"{OUT}/icp_0.png"); items = [{"a": a0, "z": z, "file": "icp_0.png", "x": bb[0], "y": bb[1]}]
    for i, r in enumerate(ICP_ROWS):
        im = layer(); d = ImageDraw.Draw(im); y = Y + 86 + i * 80
        d.rounded_rectangle((X + px, y + 30, X + px + 14, y + 34), 2, fill=GOLD)
        d.text((X + px + 34, y), r, font=rf, fill=WHITE)
        b = im.getbbox(); im.crop(b).save(f"{OUT}/icp_{i+1}.png")
        items.append({"a": a0 + 0.25 + 0.4 * i, "z": z, "file": f"icp_{i+1}.png", "x": b[0], "y": b[1]})
    im = layer(); d = ImageDraw.Draw(im); x = X + px; y = Y + 86 + len(ICP_ROWS) * 80 + 18
    for c in ICP_CHIPS:   # HubSpot-style status chips
        w_ = tw(cf, c) + 56
        comp(im, lambda dd, x=x, w_=w_: dd.rounded_rectangle((x, y, x + w_, y + 50), 25, fill=(237, 184, 103, 34), outline=GOLD, width=2))
        ImageDraw.Draw(im).text((x + 28, y + 9), c, font=cf, fill=GOLD); x += w_ + 14
    b = im.getbbox(); im.crop(b).save(f"{OUT}/icp_5.png")
    items.append({"a": a0 + 0.25 + 0.4 * len(ICP_ROWS) + 0.1, "z": z, "file": "icp_5.png", "x": b[0], "y": b[1]})
    return items
manifest["absolute"] += icp_card()

json.dump(manifest, open(f"{OUT}/manifest.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(manifest["captions"]), "captions,", len(manifest["kinetic"]), "kinetic,", len([f for f in os.listdir(OUT) if f.startswith("split_")]), "split frames ->", OUT)
