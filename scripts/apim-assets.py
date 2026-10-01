# /api merged film (v13 + v19 + yacht screens) - design assets in the YACHT film's brand system (Elena 1 Oct: "format and style of the
# text from Yacht, not the ugly existing format"; Spanish captions like the yacht film). Runs LOCALLY (Pillow) -> scp to Oracle
# ~/aigo-promo/apim/assets/, assembled by apim-cut.py. Helpers mirror aigo-promo-v4-assets.py (same tokens, same type).
# usage: python apim-assets.py <fonts+logo+qr dir> <safe screenshots dir> <out dir>
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
def comp(im, fn): l = layer(); fn(ImageDraw.Draw(l)); im.alpha_composite(l)
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
    im = Image.new("RGBA", (W, H), BG + (255,)); g = layer(); gd = ImageDraw.Draw(g)
    gd.ellipse((-500, -650, 1100, 750), fill=VIOLET + (46,)); gd.ellipse((1150, 520, 2450, 1650), fill=GOLD + (24,))
    im.alpha_composite(g.filter(ImageFilter.GaussianBlur(190)))
    comp(im, lambda d: [d.ellipse((x - 1.2, y - 1.2, x + 1.2, y + 1.2), fill=(255, 255, 255, 34)) for y in range(15, H, 30) for x in range(15, W, 30)])
    return im
def qr_plate(size, pad=26, radius=30):
    p = Image.new("RGBA", (size + 2 * pad, size + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(p).rounded_rectangle((0, 0, p.width - 1, p.height - 1), radius, fill=(255, 255, 255, 255))
    p.alpha_composite(Image.open(f"{FD}/brand_qr.png").convert("RGBA").resize((size, size), Image.LANCZOS), (pad, pad)); return p
def shadowed_paste(im, sprite, x, y, blur=22, alpha=170, dy=14):
    sh = layer(); m = sprite.split()[3].point(lambda a: alpha if a > 0 else 0)
    sh.paste(Image.new("RGBA", sprite.size, (0, 0, 0, 255)), (x, y + dy), m); im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur)))
    im.alpha_composite(sprite, (x, y))
def qr_block(im, cx, top, size, eyebrow="ESCANEA · AUDITORÍA GRATIS", url=True):
    d = ImageDraw.Draw(im); m = font(MONO, 24); spaced(d, cx - spaced_w(m, eyebrow, 6) // 2, top, eyebrow, m, GOLD, 6)
    p = qr_plate(size); shadowed_paste(im, p, cx - p.width // 2, top + 52); y = top + 52 + p.height + 30
    if url: f = manrope(46, b"Bold"); d.text((cx - tw(f, "aideazz.xyz/api") // 2, y), "aideazz.xyz/api", font=f, fill=WHITE)
def rounded(img, r):
    img = img.convert("RGBA"); m = Image.new("L", img.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, img.width - 1, img.height - 1), r, fill=255); img.putalpha(m); return img
def fit(img, mw, mh):
    s = min(mw / img.width, mh / img.height); return img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
def glass_card(x, y, w, h, alpha=205):
    im = layer(); sh = layer(); ImageDraw.Draw(sh).rounded_rectangle((x, y + 8, x + w, y + h + 8), 30, fill=(0, 0, 0, 150))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(16)))
    comp(im, lambda d: d.rounded_rectangle((x, y, x + w, y + h), 30, fill=(9, 14, 30, alpha)))
    comp(im, lambda d: d.rounded_rectangle((x, y, x + w, y + h), 30, outline=(255, 255, 255, 42), width=2)); return im
def crop_save(im, fn):
    b = im.getbbox(); im.crop(b).save(f"{OUT}/{fn}"); return {"file": fn, "x": b[0], "y": b[1]}

man = {"layout": {}, "captions": [], "absolute": [], "line_items": []}

# ---------- split panels (same as the yacht film) ----------
L = {"cx": 560, "top": 60, "maxw": 860, "maxh": 840}
rw, rh = round(864 * 840 / 1610), 840
im = backdrop(); qr_block(im, 1400, 170, 470); shadowed_paste(im, rounded(Image.new("RGB", (rw, rh), (12, 16, 28)), 34), L["cx"] - rw // 2, L["top"])
im.convert("RGB").save(f"{OUT}/panel_phone.png")
m = Image.new("L", (rw, rh), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, rw - 1, rh - 1), 34, fill=255); m.save(f"{OUT}/mask_rec.png")
man["layout"]["rec"] = {"w": rw, "h": rh, "x": L["cx"] - rw // 2, "y": L["top"]}
aw, ah = 1080, 608
im = backdrop(); qr_block(im, 1545, 210, 380); shadowed_paste(im, rounded(Image.new("RGB", (aw, ah), (12, 16, 28)), 24), 70, 150)
im.convert("RGB").save(f"{OUT}/panel_wide.png")
m = Image.new("L", (aw, ah), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, aw - 1, ah - 1), 24, fill=255); m.save(f"{OUT}/mask_audit.png")
man["layout"]["audit"] = {"w": aw, "h": ah, "x": 70, "y": 150}
for f in ("safe_S1_chatgpt_answer.jpg", "safe_S6a_tg_send_edit_skip.jpg", "safe_S8_hubspot_activity.jpg"):
    im = backdrop(); qr_block(im, 1400, 170, 470)
    ph = rounded(fit(Image.open(f"{SAFE}/{f}").convert("RGB"), L["maxw"], L["maxh"]), 34)
    shadowed_paste(im, ph, L["cx"] - ph.width // 2, L["top"] + (L["maxh"] - ph.height) // 2)
    im.convert("RGB").save(f"{OUT}/split_{f[5:-4]}.png")
im = backdrop(); qr_block(im, 1400, 170, 470)                     # WhatsApp floating over her real HubSpot deals list
hub = rounded(fit(Image.open(f"{SAFE}/hub_deals_list.jpg").convert("RGB"), 980, 600), 22); shadowed_paste(im, hub, 70, 130)
wa = rounded(fit(Image.open(f"{SAFE}/safe_S2_whatsapp.jpg").convert("RGB"), 700, 400), 28)
shadowed_paste(im, wa, 70 + hub.width - wa.width + 40, 130 + hub.height - 70, blur=26, alpha=200, dy=18)
im.convert("RGB").save(f"{OUT}/split_S2_whatsapp.png")

# ---------- opening title on the v19 mango (the /api hero line, in Spanish as the site says it) ----------
im = layer(); sc = Image.new("L", (W, H), 0); sd = ImageDraw.Draw(sc)
for x in range(1150): sd.line([(x, 0), (x, H)], fill=int(170 * (1 - x / 1150) ** 1.4))
im.paste(Image.new("RGBA", (W, H), (2, 4, 10, 255)), (0, 0), sc)
X = 92; spaced(ImageDraw.Draw(im), X + 4, 330, "AIDEAZZ AI LAB · 34 SEÑALES · GRATIS", font(MONO, 24), GOLD, 6)
s, it = font(SERIF, 104), font(ITALIC, 136)
halo_runs(im, X, 380, [("¿Puede la IA", s, WHITE)], blur=12, alpha=210)
halo_runs(im, X, 488, [("encontrarte y ", s, WHITE)], blur=12, alpha=210)
halo_runs(im, X - 4, 586, [("citarte?", it, GOLD)], blur=14, alpha=220)
d = ImageDraw.Draw(im); d.rounded_rectangle((X + 4, 780, X + 164, 784), 2, fill=VIOLET); d.rounded_rectangle((X + 204, 780, X + 364, 784), 2, fill=GOLD)
im.save(f"{OUT}/title_open.png"); man["absolute"].append({"line": "a01", "t0": -1.0, "t1": None, "file": "title_open.png", "x": 0, "y": 0})

# ---------- the four groups card (on the v13 crystal shot) - real weights from src/visibility-audit.ts ----------
GROUPS = [("Acceso de los rastreadores de IA", "25"), ("Datos estructurados (GEO)", "25"), ("Respuestas listas para citar (AEO)", "30"), ("Base técnica", "20")]
X0, Y0, px = 60, 56, 54; rf = font(SERIF, 60); nf = manrope(30, b"Bold"); mf = font(MONO, 24)
cw = max(tw(rf, g) for g, _ in GROUPS) + 230 + 2 * px; ch = 70 + len(GROUPS) * 84 + 30
bg = glass_card(X0, Y0, cw, ch); spaced(ImageDraw.Draw(bg), X0 + px, Y0 + 34, "34 SEÑALES · 4 GRUPOS · PUNTOS", mf, GOLD, 7)
man["line_items"].append({"line": "a06", "t0": 0.05, "t1": None, **crop_save(bg, "groups_0.png")})
for i, (g, w_) in enumerate(GROUPS):
    im = layer(); d = ImageDraw.Draw(im); y = Y0 + 88 + i * 84
    d.text((X0 + px, y), f"{i + 1}", font=font(ITALIC, 60), fill=GOLD); d.text((X0 + px + 54, y), g, font=rf, fill=WHITE)
    pw = tw(nf, w_) + 40; xx = X0 + cw - px - pw
    comp(im, lambda dd, xx=xx, y=y, pw=pw: dd.rounded_rectangle((xx, y + 14, xx + pw, y + 62), 24, fill=(237, 184, 103, 34), outline=GOLD, width=2))
    ImageDraw.Draw(im).text((xx + 20, y + 20), w_, font=nf, fill=GOLD)
    man["line_items"].append({"line": "a06", "t0": 0.35 + 0.55 * i, "t1": None, **crop_save(im, f"groups_{i + 1}.png")})

# ---------- group labels over the real checks (top-left, above the audit window) ----------
def eyebrow(fn, text, sub=None):
    im = layer(); d = ImageDraw.Draw(im); spaced(d, 74, 70, text, font(MONO, 26), GOLD, 7)
    if sub: spaced(d, 74, 108, sub, font(MONO, 20), (185, 188, 200), 5)
    return crop_save(im, fn)
for line, fn, t, sub in (("a07", "eb_g1.png", "GRUPO 1 · ACCESO DE LOS RASTREADORES DE IA · 25 PUNTOS", "¿PUEDEN ENTRAR? ROBOTS.TXT · LLMS.TXT · SITEMAP · PÁGINA INDEXABLE"),
                         ("a08", "eb_g2.png", "GRUPO 2 · DATOS ESTRUCTURADOS (GEO) · 25 PUNTOS", "¿SABEN QUIÉN ERES Y QUÉ VENDES? SCHEMA · IDENTIDAD · OPEN GRAPH"),
                         ("a09", "eb_g3.png", "GRUPO 3 · RESPUESTAS LISTAS PARA CITAR (AEO) · 30 PUNTOS", "EL QUE MÁS PESA: PREGUNTAS COMO TÍTULOS · LISTAS · CONTENIDO CITABLE"),
                         ("a10", "eb_g4.png", "GRUPO 4 · BASE TÉCNICA · 20 PUNTOS", "HTTPS · VELOCIDAD · MÓVIL · CONTENIDO SIN JAVASCRIPT"),
                         ("a11", "eb_fix.png", "LAS CORRECCIONES, EN ORDEN DE PRIORIDAD", "LO QUE VIMOS · POR QUÉ IMPORTA · CÓMO ARREGLARLO")):
    man["line_items"].append({"line": line, "t0": 3.45 if line == "a07" else 0.0, "t1": None, **eyebrow(fn, t, sub)})   # g1 waits for the audit screen

# ---------- callouts: the real failing checks + fixes of the atuona.xyz audit, in plain Spanish (Elena 1 Oct: "understandable and
# attractive for a business owner" - the real rows are English and small). Under the audit window, above the captions.
def callout(fn, rows, x=70, y=762, w=1080):
    # bottom stays above a two-line caption (top ≈ 882); text auto-shrinks so it can never run past the card
    lf = font(MONO, 20); lh = 38; lw = max(spaced_w(lf, r[0], 4) for r in rows) + 24
    size = 28
    while size > 20 and max(tw(manrope(size, b"SemiBold"), r[2]) for r in rows) > w - 34 - lw - 30: size -= 1
    vf = manrope(size, b"SemiBold"); h = 22 + len(rows) * lh + 10
    im = glass_card(x, y, w, h, alpha=228); d = ImageDraw.Draw(im)
    comp(im, lambda dd: dd.rounded_rectangle((x, y, x + 8, y + h), 4, fill=GOLD))
    for i, (label, color, text) in enumerate(rows):
        yy = y + 16 + i * lh; spaced(d, x + 34, yy + 6, label, lf, color, 4); d.text((x + 34 + lw, yy), text, font=vf, fill=WHITE)
    return crop_save(im, fn)
WARN, OK = (255, 170, 90), (110, 220, 150)
man["line_items"].append({"line": "a08", "t0": 3.2, "t1": None, **callout("co_g2.png", [
    ("FALTA", WARN, "Datos que la IA pueda citar tal cual (FAQ / Servicio)"),
    ("ARREGLO", GOLD, "Marca tus preguntas u oferta con schema FAQPage o Service")])})
man["line_items"].append({"line": "a09", "t0": 0.4, "t1": 5.25, **callout("co_g3a.png", [
    ("FALTA", WARN, "Títulos escritos como preguntas"),
    ("ARREGLO", GOLD, "Preguntas frecuentes con las preguntas reales de tus clientes")])})
man["line_items"].append({"line": "a09", "t0": 5.6, "t1": None, **callout("co_g3b.png", [
    ("FALTA", WARN, "Listas o tablas"),
    ("ARREGLO", GOLD, "Servicios, precios y pasos en listas: la IA los copia tal cual")])})
man["line_items"].append({"line": "a11", "t0": 0.3, "t1": None, **callout("co_score.png", [
    ("RESULTADO", OK, "31 de 34 señales aprobadas  ·  3 por corregir"),
    ("ORDEN", GOLD, "Primero lo que más te acerca a ser citado")])})

# ---------- "Haz la tuya gratis." on the starfruit ----------
def title(fn, l1, l2, size, left=60, y=60):
    s, it = font(SERIF, size), font(ITALIC, size); r1, r2 = [(l1, s, WHITE)], [(l2, it, GOLD)]
    w_ = max(runs_w(r1), runs_w(r2)); px_, py, gap = 64, 34, 10; cw_, ch_ = w_ + 2 * px_, 2 * size + gap + 2 * py + 18
    im = Image.new("RGBA", (cw_ + 60, ch_ + 60), (0, 0, 0, 0))
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((30, 38, 30 + cw_, 38 + ch_), 28, fill=(0, 0, 0, 140))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14))); ImageDraw.Draw(im).rounded_rectangle((30, 30, 30 + cw_, 30 + ch_), 28, fill=(9, 14, 30, 196))
    rim = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(rim).rounded_rectangle((30, 30, 30 + cw_, 30 + ch_), 28, outline=(255, 255, 255, 40), width=2); im.alpha_composite(rim)
    d = ImageDraw.Draw(im)
    for k, runs in enumerate((r1, r2)): draw_runs(d, 30 + (cw_ - runs_w(runs)) // 2, 30 + py - size // 8 + k * (size + gap), runs)
    im.save(f"{OUT}/{fn}"); return {"file": fn, "x": left, "y": y}
man["line_items"].append({"line": "a13", "t0": 0.0, "t1": 1.85, **title("title_run.png", "Haz la tuya", "gratis.", 104)})

# ---------- end card (split, QR 560) ----------
im = backdrop(); d = ImageDraw.Draw(im); CX = 640
lg = Image.open(f"{FD}/brand_logo.png").convert("RGBA"); lg = lg.crop(lg.getbbox()); lg = lg.resize((470, round(lg.height * 470 / lg.width)), Image.LANCZOS)
im.alpha_composite(lg, (CX - 235, 90))
t = "AUDITORÍA DE VISIBILIDAD EN IA · 34 SEÑALES"; spaced(d, CX - spaced_w(font(MONO, 22), t, 6) // 2, 350, t, font(MONO, 22), GOLD, 6)
s, it = font(SERIF, 104), font(ITALIC, 104)
for y, runs in ((392, [("¿Puede la IA", s, WHITE)]), (500, [("encontrarte y ", s, WHITE), ("citarte?", it, GOLD)])): draw_runs(d, CX - runs_w(runs) // 2, y, runs)
b = manrope(30, b"Medium"); t2 = "Gratis  ·  sin registro  ·  en segundos"; d.text((CX - tw(b, t2) // 2, 646), t2, font=b, fill=(229, 231, 235))
f = manrope(50, b"Bold"); label, arrow = "aideazz.xyz/api", "  →"; pw, ph = tw(f, label) + tw(f, arrow) + 110, 98; x0, y0 = CX - pw // 2, 712
ring = Image.new("RGBA", (pw + 8, ph + 8)); rd = ImageDraw.Draw(ring)
for i in range(pw + 8):
    k = i / (pw + 7); rd.line([(i, 0), (i, ph + 8)], fill=(round(255 - 31 * k), round(92 - 59 * k), round(53 + 85 * k), 255))
mask = Image.new("L", ring.size, 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, pw + 7, ph + 7), (ph + 8) // 2, fill=255)
im.paste(ring, (x0 - 4, y0 - 4), mask); d = ImageDraw.Draw(im); d.rounded_rectangle((x0, y0, x0 + pw, y0 + ph), ph // 2, fill=(11, 16, 32, 255))
ty = y0 + (ph - (f.getbbox("Ag")[3] - f.getbbox("Ag")[1])) // 2 - f.getbbox("Ag")[1]
d.text((x0 + 55, ty), label, font=f, fill=WHITE); d.text((x0 + 55 + tw(f, label), ty), arrow, font=f, fill=GOLD)
n = manrope(22, b"Regular"); t3 = "Dramatización: personas generadas con IA. Pantallas reales."; d.text((CX - tw(n, t3) // 2, 1010), t3, font=n, fill=(140, 140, 150))
qr_block(im, 1440, 140, 560, eyebrow="ESCANEA CON TU CÁMARA", url=False)
im.convert("RGB").save(f"{OUT}/card_end.png")

# ---------- captions (yacht style: Instrument Serif, *phrase* = gold italic, soft halo + scrim) ----------
CAPS = {
 "a02": [(0.0, 1.65, "Google posicionó tu página."), (1.65, 4.9, "En 2026, *eso es solo la mitad de la fruta.*")],
 "a03": [(0.0, 2.95, "Tu próximo cliente *le pregunta primero a ChatGPT.*"), (2.95, 6.03, "Sugiere los negocios *que puede entender.*"),
         (6.03, 10.2, "Si no entiende tu sitio web, *puede que no estés en la lista.*")],
 "a04": [(0.0, 3.45, "Descúbrelo gratis. Abre *aideazz.xyz/api.*"), (3.45, 5.5, "Escribe tu sitio web. *Haz clic en auditar.*")],
 "a05": [(0.0, 2.9, "Segundos después: *una puntuación sobre cien.*")],
 "a06": [(0.0, 3.6, "Detrás de esa puntuación: *34 señales, en cuatro grupos.*")],
 "a07": [(0.0, 2.44, "Uno: ¿pueden entrar *los robots de IA?*"), (2.44, 7.03, "ChatGPT, Claude, Gemini y Perplexity *envían cada uno su propio rastreador.*"),
         (7.03, 9.8, "Bloquea uno, *y ese asistente nunca te lee.*")],
 "a08": [(0.0, 3.9, "Dos: ¿tu sitio le dice a la IA *quién eres y qué vendes,*"), (3.9, 6.0, "*en el formato que leen las máquinas?*")],
 "a09": [(0.0, 1.3, "Tres, *el más importante:*"), (1.3, 4.8, "¿tu página responde *las preguntas que hacen tus clientes?*"),
         (4.8, 8.17, "Preguntas como títulos. *Datos en listas:*"), (8.17, 9.8, "*eso es lo que se cita.*")],
 "a10": [(0.0, 3.85, "Cuatro: ¿es rápido, seguro *y legible sin JavaScript?*")],
 "a11": [(0.0, 1.63, "Por cada señal que falla:"), (1.63, 5.0, "*lo que vimos, por qué importa y la corrección exacta.*")],
 "a12": [(0.0, 1.78, "Ser encontrado es *el primer paso.*"), (1.78, 4.47, "Nuestro AI Growth Operator *responde al cliente,*"),
         (4.47, 7.5, "*redacta tu respuesta y la registra en tu CRM.*")],
}
CS = 66; CR, CI = font(SERIF, CS), font(ITALIC, CS); MAXW, LH = 1180, 76
def parse(mk):
    out, it_ = [], False
    for part in mk.split("*"):
        for w_ in part.split(" "):
            if w_: out.append((w_, it_))
        it_ = not it_
    return out
def lines_of(words):
    ls, cur = [], []
    def wd(ws): return sum(tw(CI if i else CR, w_ + " ") for w_, i in ws)
    for w_ in words:
        if cur and wd(cur + [w_]) > MAXW: ls.append(cur); cur = [w_]
        else: cur.append(w_)
    ls.append(cur)
    if len(ls) == 2 and len(ls[1]) == 1 and len(ls[0]) > 2: ls = [ls[0][:-1], [ls[0][-1]] + ls[1]]
    return ls
def runs_of(line):
    runs = []
    for k, (w_, i) in enumerate(line):
        t_ = w_ + (" " if k < len(line) - 1 else ""); f_, c_ = (CI, GOLD) if i else (CR, WHITE)
        if runs and runs[-1][1] is f_: runs[-1] = (runs[-1][0] + t_, f_, c_)
        else: runs.append((t_, f_, c_))
    return runs
for key, chunks in CAPS.items():
    for n_, (t0, t1, text) in enumerate(chunks):
        ls = lines_of(parse(text)); assert len(ls) <= 2, text
        im = layer(); y0 = H - 46 - len(ls) * LH
        for j, line in enumerate(ls): r = runs_of(line); halo_runs(im, (W - runs_w(r)) // 2, y0 + j * LH, r, blur=9, alpha=235)
        b = im.getbbox(); im.crop(b).save(f"{OUT}/cap_{key}_{n_}.png")
        man["captions"].append({"line": key, "t0": t0, "t1": t1, "file": f"cap_{key}_{n_}.png", "x": b[0], "y": b[1], "text": text.replace("*", "")})
sc = Image.new("RGBA", (W, 330), (0, 0, 0, 0)); sd = ImageDraw.Draw(sc)
for y in range(330): sd.line([(0, y), (1500, y)], fill=(0, 0, 0, int(150 * (y / 329) ** 1.6)))
for x in range(1500, 1560):
    a = 1 - (x - 1500) / 60
    for y in range(330): sc.putpixel((x, y), (0, 0, 0, int(150 * (y / 329) ** 1.6 * a)))
sc.save(f"{OUT}/scrim.png"); man["scrim"] = {"file": "scrim.png", "x": 0, "y": H - 330}

json.dump(man, open(f"{OUT}/manifest.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(man["captions"]), "captions,", len(man["line_items"]), "line items ->", OUT)
