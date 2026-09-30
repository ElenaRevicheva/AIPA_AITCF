# AI Growth Operator promo - Spanish on-screen text, restyled to the aideazz.xyz/api look (Elena, 30 Sep: "stylish - like
# HubSpot UI and my own website", "captions in Spanish"). Runs LOCALLY (needs Pillow); the PNGs are scp'd to Oracle and
# overlaid by aigo-promo-cut3.py. Design tokens read from the live /api page: bg #030711, Instrument Serif headline with a
# gold italic accent word (#EDB867), letter-spaced monospace eyebrow, glass cards (slate 70% + white/10 border, rounded),
# Manrope body. HubSpot touch: the rounded status chip and the orange->magenta ring of its AI bar on the call to action.
# Narration stays English (her locked voice); every Spanish caption is timed to the pauses measured in the voice files.
# usage: python aigo-promo-es-assets.py <fonts_dir> <in_dir: brand_logo.png brand_qr.png hs_deal_raw.jpg> <out_dir>
import json, os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FD, IN, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
W, H = 1920, 1080
BG, GOLD, VIOLET, WHITE = (3, 7, 17), (237, 184, 103), (157, 140, 255), (255, 255, 255)
SERIF, ITALIC = f"{FD}/InstrumentSerif-Regular.ttf", f"{FD}/InstrumentSerif-Italic.ttf"
MONO = "C:/Windows/Fonts/consola.ttf"

def manrope(size, weight=b"SemiBold"):
    f = ImageFont.truetype(f"{FD}/Manrope-var.ttf", size); f.set_variation_by_name(weight); return f
def font(path, size): return ImageFont.truetype(path, size)
def width(f, t): return f.getbbox(t)[2] if t else 0

def spaced(d, xy, text, f, fill, track):
    # letter-spaced monospace eyebrow (PIL has no letter-spacing)
    x, y = xy
    for ch in text: d.text((x, y), ch, font=f, fill=fill); x += width(f, ch) + track
def spaced_w(f, text, track): return sum(width(f, c) + track for c in text) - track

def runs_w(runs): return sum(width(f, t) for t, f, _ in runs)
def draw_runs(d, x, y, runs):
    for t, f, c in runs: d.text((x, y), t, font=f, fill=c); x += width(f, t)

def shadowed(canvas, draw_fn, blur=14, alpha=210, offset=(0, 4)):
    # soft dark halo under text laid over footage, so it reads on bright sea and sky
    sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0)); draw_fn(ImageDraw.Draw(sh), (0, 0, 0, alpha), offset)
    sh = sh.filter(ImageFilter.GaussianBlur(blur)); canvas.alpha_composite(sh); draw_fn(ImageDraw.Draw(canvas), None, (0, 0))

def backdrop():
    im = Image.new("RGBA", (W, H), BG + (255,))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0)); g = ImageDraw.Draw(glow)
    g.ellipse((-500, -650, 1100, 750), fill=VIOLET + (46,)); g.ellipse((1150, 520, 2450, 1650), fill=GOLD + (24,))
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(190)))
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0)); dots = ImageDraw.Draw(layer)     # ImageDraw REPLACES alpha on RGBA,
    for yy in range(15, H, 30):                                                          # so translucent marks go on their
        for xx in range(15, W, 30): dots.ellipse((xx - 1.2, yy - 1.2, xx + 1.2, yy + 1.2), fill=(255, 255, 255, 34))
    im.alpha_composite(layer); return im                                                 # own layer and are composited

def paste_logo(im, w, y):
    lg = Image.open(f"{IN}/brand_logo.png").convert("RGBA"); lg = lg.crop(lg.getbbox())
    lg = lg.resize((w, round(lg.height * w / lg.width)), Image.LANCZOS); im.alpha_composite(lg, ((W - w) // 2, y))
def paste_qr(im, size, margin):
    qr = Image.open(f"{IN}/brand_qr.png").convert("RGBA").resize((size, size), Image.LANCZOS)
    im.alpha_composite(qr, (W - size - margin, H - size - margin))
def centered_runs(d, y, runs): draw_runs(d, (W - runs_w(runs)) // 2, y, runs)
def motif(d, y):
    # the logo's violet line + gold line
    d.rounded_rectangle((W // 2 - 190, y, W // 2 - 30, y + 4), 2, fill=VIOLET); d.rounded_rectangle((W // 2 + 30, y, W // 2 + 190, y + 4), 2, fill=GOLD)

# ---------- full-frame cards (the three narration lines that ARE text: thesis, reveal, end) ----------
def card_thesis():
    im = backdrop(); d = ImageDraw.Draw(im); s, it = font(SERIF, 112), font(ITALIC, 112)
    centered_runs(d, 350, [("Nadie se despierta queriendo IA.", s, WHITE)])
    centered_runs(d, 490, [("Tú quieres ", s, WHITE), ("más reservas.", it, GOLD)])
    motif(d, 700); paste_qr(im, 260, 60); return im

def card_reveal():
    im = backdrop(); d = ImageDraw.Draw(im); s, it = font(SERIF, 84), font(ITALIC, 84)
    paste_logo(im, 640, 150)
    centered_runs(d, 520, [("Las personas de esta película son IA.", s, WHITE)])
    centered_runs(d, 625, [("Las pantallas del producto son ", s, WHITE), ("reales.", it, GOLD)])
    m = font(MONO, 26); t = "HECHO EN NUESTRO PROPIO ESTUDIO DE CINE CON IA"
    spaced(d, ((W - spaced_w(m, t, 6)) // 2, 790), t, m, (185, 188, 200), 6)
    paste_qr(im, 260, 60); return im

def card_end():
    im = backdrop(); d = ImageDraw.Draw(im)
    paste_logo(im, 560, 70)
    m = font(MONO, 26); t = "AI GROWTH OPERATOR · POR AIDEAZZ AI LAB"
    spaced(d, ((W - spaced_w(m, t, 7)) // 2, 360), t, m, GOLD, 7)
    s, it = font(SERIF, 100), font(ITALIC, 100)
    centered_runs(d, 420, [("¿Qué ve la IA cuando mira ", s, WHITE), ("tu negocio?", it, GOLD)])
    b = manrope(34, b"Medium"); t2 = "Auditoría de visibilidad en IA  ·  34 señales  ·  gratis"
    d.text(((W - width(b, t2)) // 2, 572), t2, font=b, fill=(229, 231, 235))
    # call to action: dark pill inside the HubSpot AI-bar ring (orange -> magenta)
    f = manrope(54, b"Bold"); label = "aideazz.xyz/api"; arrow = "  →"
    pw = width(f, label) + width(f, arrow) + 120; ph = 104; x0, y0 = (W - pw) // 2, 660
    ring = Image.new("RGBA", (pw + 8, ph + 8)); rd = ImageDraw.Draw(ring)
    for i in range(pw + 8):
        k = i / (pw + 7); c = (round(255 - 31 * k), round(92 - 59 * k), round(53 + 85 * k), 255)   # #FF5C35 -> #E0218A
        rd.line([(i, 0), (i, ph + 8)], fill=c)
    mask = Image.new("L", ring.size, 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, pw + 7, ph + 7), (ph + 8) // 2, fill=255)
    im.paste(ring, (x0 - 4, y0 - 4), mask)
    d.rounded_rectangle((x0, y0, x0 + pw, y0 + ph), ph // 2, fill=(11, 16, 32, 255))
    tx = x0 + 60; ty = y0 + (ph - (f.getbbox("Ag")[3] - f.getbbox("Ag")[1])) // 2 - f.getbbox("Ag")[1]
    d.text((tx, ty), label, font=f, fill=WHITE); d.text((tx + width(f, label), ty), arrow, font=f, fill=GOLD)
    n = manrope(24, b"Regular"); t3 = "Dramatización: personas generadas con IA."
    d.text(((W - width(n, t3)) // 2, 1010), t3, font=n, fill=(140, 140, 150))
    paste_qr(im, 330, 60); return im

for name, fn in (("card_s04", card_thesis), ("card_s11", card_reveal), ("card_s12", card_end)):
    fn().convert("RGB").save(f"{OUT}/{name}.png")

# ---------- captions: dark glass pill, bottom centre (clear of the QR at bottom-right) ----------
CAPS = {
    "s01": [(0.05, 2.71, "Tu próxima clienta de chárter está planeando a medianoche."),
            (2.71, 5.75, "No te está llamando. Le está preguntando a una IA.")],
    "s02": [(0.05, 2.45, "La IA sugiere los barcos que puede entender."),
            (2.45, 5.90, "Si no entiende tu sitio web, puede que no estés en la lista.")],
    "s03": [(0.05, 1.81, "Algunos clientes te escriben directamente."),
            (1.81, 3.42, "Viernes por la noche: estás en el mar."),
            (3.42, 4.58, "Respondes el lunes."),
            (4.58, 7.00, "Ella ya reservó el barco que respondió primero.")],
    "s05": [(0.20, 1.06, "Rebobina."),
            (3.41, 6.40, "Esta vez tienes un AI Growth Operator.")],
    "s06": [(0.05, 3.88, "Primero, revisa qué puede entender realmente la IA de tu sitio web."),
            (3.88, 6.33, "34 señales. Una puntuación."),
            (6.33, 8.00, "Las correcciones que importan.")],
    "s07": [(0.05, 2.70, "Cuando ella escribe, recibe respuesta al instante."),
            (2.70, 5.60, "Y ya tienes una respuesta redactada en tu teléfono.")],
    "s08": [(0.05, 2.50, "La IA redacta. Tú decides."),
            (2.50, 3.70, "Un toque: enviado."),
            (3.70, 6.40, "Y la conversación queda registrada en tu CRM.")],
    "s09": [(0.05, 2.14, "Cada mañana sabes quién es nuevo,"),
            (2.14, 4.78, "quién está interesado y quién se te empieza a escapar.")],
    "s10": [(0.05, 3.53, "AIdeazz AI Lab no te vende otro CRM."),
            (3.53, 7.70, "Instalamos un AI Growth Operator dentro de las herramientas que ya usas,"),
            (7.70, 9.00, "y lo operamos contigo.")],
}
CF, MAXW, LH, PX, PY = manrope(46, b"SemiBold"), 1060, 60, 40, 20

def wrap(text):
    words, lines, cur = text.split(), [], ""
    for w_ in words:
        t = (cur + " " + w_).strip()
        if width(CF, t) <= MAXW or not cur: cur = t
        else: lines.append(cur); cur = w_
    lines.append(cur)
    if len(lines) == 2 and len(lines[1].split()) == 1 and len(lines[0].split()) > 2:   # no single-word orphan line
        a = lines[0].split(); lines = [" ".join(a[:-1]), a[-1] + " " + lines[1]]
    return lines

manifest = {"captions": [], "titles": []}
for key, chunks in CAPS.items():
    for i, (t0, t1, text) in enumerate(chunks):
        lines = wrap(text); assert len(lines) <= 2, text
        tw = max(width(CF, l) for l in lines); pw, ph = tw + 2 * PX, len(lines) * LH + 2 * PY
        im = Image.new("RGBA", (pw + 40, ph + 40), (0, 0, 0, 0))
        sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((20, 26, 20 + pw, 26 + ph), 22, fill=(0, 0, 0, 120))
        im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10)))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle((20, 20, 20 + pw, 20 + ph), 22, fill=(9, 14, 30, 212))
        rim = Image.new("RGBA", im.size, (0, 0, 0, 0))
        ImageDraw.Draw(rim).rounded_rectangle((20, 20, 20 + pw, 20 + ph), 22, outline=(255, 255, 255, 40), width=2); im.alpha_composite(rim)
        for j, l in enumerate(lines):
            d.text((20 + (pw - width(CF, l)) // 2, 20 + PY + j * LH - 4), l, font=CF, fill=(248, 248, 250, 255))
        fn = f"cap_{key}_{i}.png"; im.save(f"{OUT}/{fn}")
        manifest["captions"].append({"line": key, "t0": t0, "t1": t1, "file": fn, "x": (W - im.width) // 2, "y": H - 58 - im.height, "text": text})

# ---------- on-footage titles (website headline style, soft halo instead of a box) ----------
def title(fn, l1, l2, y, size=92, left=None):
    # website headline on the website's glass card: over bright sky a halo alone left the gold line unreadable (v3 check, 0:21)
    s, it = font(SERIF, size), font(ITALIC, size)
    r1, r2 = [(l1, s, WHITE)], [(l2, it, GOLD)]
    tw_ = max(runs_w(r1), runs_w(r2)); px, py, gap = 64, 34, 10
    cw, ch = tw_ + 2 * px, 2 * size + gap + 2 * py + 18
    im = Image.new("RGBA", (cw + 60, ch + 60), (0, 0, 0, 0))
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((30, 38, 30 + cw, 38 + ch), 28, fill=(0, 0, 0, 140))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14)))
    ImageDraw.Draw(im).rounded_rectangle((30, 30, 30 + cw, 30 + ch), 28, fill=(9, 14, 30, 196))
    rim = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(rim).rounded_rectangle((30, 30, 30 + cw, 30 + ch), 28, outline=(255, 255, 255, 40), width=2)
    im.alpha_composite(rim); d = ImageDraw.Draw(im)
    for k, runs in enumerate((r1, r2)):
        x = 30 + (cw - runs_w(runs)) // 2; yy = 30 + py - size // 8 + k * (size + gap)
        for t, f, c in runs: d.text((x, yy), t, font=f, fill=c); x += width(f, t)
    im.save(f"{OUT}/{fn}")
    return {"file": fn, "x": (W - im.width) // 2 if left is None else left, "y": y}
manifest["titles"].append({"line": "s03", "t0": 6.10, "t1": None, **title("title_s03.png", "Las buenas oportunidades", "se enfrían en silencio.", 60, size=80, left=60)})   # upper-left: faces are centre/right
manifest["titles"].append({"line": "s05", "t0": 1.10, "t1": 3.40, **title("title_s05.png", "Misma clienta.", "Misma pregunta.", 60, size=92, left=60)})

# ---------- B9 real HubSpot screen (Elena's phone, 30 Sep): blur her name in the stage label, drop the OS bars ----------
hs = Image.open(f"{IN}/hs_deal_raw.jpg").convert("RGB")
box = (626, 528, 724, 582); hs.paste(hs.crop(box).filter(ImageFilter.GaussianBlur(9)), box[:2])
hs.crop((0, 112, 1080, 2205)).save(f"{OUT}/safe_S9_hubspot_deal.jpg", quality=94)

json.dump(manifest, open(f"{OUT}/manifest.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(manifest["captions"]), "captions,", len(manifest["titles"]), "titles, 3 cards, 1 screen ->", OUT)
