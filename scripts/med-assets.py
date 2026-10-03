# MEDICAL-TOURISM film (ICP #5, 3 Oct 2026) - "They Asked ChatGPT Before They Messaged Your Clinic" (Colombian dental clinics +
# plastic-surgery practices). Copy of reloc-assets.py on the same brand system (Instrument Serif + gold italic captions, glass
# cards, split frames: real screen left, big QR right). For this film: the Dallas opening title, clinic chips (TU CLINICA
# ODONTOLOGICA / TU CONSULTORIO DE CIRUGIA PLASTICA / MEDELLIN · NOVIEMBRE / RECUPERACION ...), two WhatsApp recreation threads
# (him -> dental clinic, her -> plastic surgery), the recovery bubble overlay for T3, the ICP card with the dental + plastic-surgery
# lanes first in gold + the verified Migracion/ANATO fact line, the end-card subline "Para clinicas dentales y de cirugia plastica".
# Captions s01-s04 are timed to the pause-bounded segments of med-vo.py's takes (silencedetect + per-segment transcription).
# Plan: docs/selling/video/2026-10-03_MEDTOUR_COLOMBIA_FILM_PLAN.md. Runs LOCALLY (Pillow).
# usage: python med-assets.py <fonts+logo+qr dir> <safe screenshots dir> <out dir>
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
def glass(cw, ch, alpha=200):
    im = Image.new("RGBA", (cw + 60, ch + 60), (0, 0, 0, 0))
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((30, 38, 30 + cw, 38 + ch), 28, fill=(0, 0, 0, 140))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14))); ImageDraw.Draw(im).rounded_rectangle((30, 30, 30 + cw, 30 + ch), 28, fill=(9, 14, 30, alpha))
    rim = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(rim).rounded_rectangle((30, 30, 30 + cw, 30 + ch), 28, outline=(255, 255, 255, 40), width=2)
    im.alpha_composite(rim); return im

L = {"cx": 560, "top": 60, "maxw": 860, "maxh": 840}
manifest = {"layout": {}, "captions": [], "titles": [], "kinetic": [], "scrim": None, "chips": {}, "absolute": []}
REAL = "PANTALLAS REALES · UNA CONSULTA DE PRUEBA EN NUESTRO PROPIO SITIO"
def real_line(im):
    m = font(MONO, 19); spaced(ImageDraw.Draw(im), max(40, L["cx"] - spaced_w(m, REAL, 3) // 2), H - 44, REAL, m, (175, 180, 196), 3)

# ---------- split frames for every real phone screen ----------
for f in ("safe_S4_inquiry_copy.jpg", "safe_S4_gmail_ack.jpg", "safe_S4_tg_card_draft.jpg", "safe_S5_tg_sent.jpg", "safe_S5_hubspot_activity.jpg"):
    im = backdrop(); qr_block(im, 1400, 170, 470)
    ph = rounded(fit(Image.open(f"{SAFE}/{f}").convert("RGB"), L["maxw"], L["maxh"] - 30), 34)
    shadowed_paste(im, ph, L["cx"] - ph.width // 2, L["top"] + (L["maxh"] - 30 - ph.height) // 2)
    real_line(im); im.convert("RGB").save(f"{OUT}/split_{f[5:-4]}.png")

# S2b - the two WhatsApp threads (Elena's own phone, staged, "Recreacion"): the clinic's Monday line (green, right) and the
# couple's answer (white, left). His thread -> the dental clinic, hers -> the plastic-surgery practice.
def wa_thread(src, face_src, label, sub, out):
    im = backdrop(); qr_block(im, 1400, 170, 470)
    bub = Image.open(f"{SAFE}/{src}").convert("RGB"); bub = rounded(fit(bub, 1010, 470), 30)
    by = 560; shadowed_paste(im, bub, 90, by, blur=26, alpha=200, dy=18)   # below the s03 title card
    face = Image.open(f"{SAFE}/{face_src}").convert("RGB"); s_ = min(face.size); face = face.crop(((face.width - s_) // 2, 0, (face.width + s_) // 2, s_)).resize((150, 150), Image.LANCZOS)
    fm = Image.new("L", (150, 150), 0); ImageDraw.Draw(fm).ellipse((0, 0, 149, 149), fill=255); face = face.convert("RGBA"); face.putalpha(fm)
    ring = Image.new("RGBA", (162, 162), (0, 0, 0, 0)); ImageDraw.Draw(ring).ellipse((0, 0, 161, 161), outline=GOLD, width=4); ring.alpha_composite(face, (6, 6))
    shadowed_paste(im, ring, 90, by - 200)
    d = ImageDraw.Draw(im); m = font(MONO, 28); spaced(d, 280, by - 160, label, m, GOLD, 6)
    t = manrope(30, b"SemiBold"); d.text((280, by - 110), sub, font=t, fill=(220, 223, 232))
    tag = font(MONO, 22); spaced(d, 92, by + bub.height + 44, "RECREACIÓN", tag, (175, 180, 196), 6)
    im.convert("RGB").save(f"{OUT}/{out}")
wa_thread("safe_S2b_wa_dental.jpg", "RH_face.jpg", "ÉL  →  CLÍNICA DENTAL", "La clínica responde el lunes", "split_S2b_dental.png")
wa_thread("safe_S2b_wa_surgery.jpg", "R1_face.jpg", "ELLA  →  CIRUGÍA PLÁSTICA", "La coordinadora responde el lunes", "split_S2b_surgery.png")

# T3 overlay: the coordinator's logistics-only recovery message on his phone (incoming bubble), tagged Recreacion
def t3_bubble():
    im = layer(); bub = rounded(fit(Image.open(f"{SAFE}/safe_T3_wa_recovery.jpg").convert("RGB"), 760, 300), 26)
    x, y = 70, H - bub.height - 130; shadowed_paste(im, bub, x, y, blur=24, alpha=190, dy=14)   # lower left: the nurse's face is top right in T3
    m = font(MONO, 20); t = "LA COORDINADORA · RECREACIÓN"
    sh = layer(); spaced(ImageDraw.Draw(sh), x + 4 + 2, y + bub.height + 24 + 2, t, m, (0, 0, 0, 220), 5); im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(5)))
    spaced(ImageDraw.Draw(im), x + 4, y + bub.height + 24, t, m, (235, 236, 242), 5)
    return im
t3_bubble().save(f"{OUT}/t3_bubble.png")

# panels for the two VIDEO screens: the ChatGPT recording (590x1280, status + nav bars cropped 7%) and the live audit page
rw, rh = round(648 * 840 / (1404 * 0.82)), 840
im = backdrop(); qr_block(im, 1400, 170, 470)
shadowed_paste(im, rounded(Image.new("RGB", (rw, rh), (12, 16, 28)), 34), L["cx"] - rw // 2, L["top"])
im.convert("RGB").save(f"{OUT}/panel_phone.png")
m_ = Image.new("L", (rw, rh), 0); ImageDraw.Draw(m_).rounded_rectangle((0, 0, rw - 1, rh - 1), 34, fill=255); m_.save(f"{OUT}/mask_rec.png")
manifest["layout"]["rec"] = {"w": rw, "h": rh, "x": L["cx"] - rw // 2, "y": L["top"]}
aw, ah = 1080, 608
im = backdrop(); qr_block(im, 1545, 210, 380)
shadowed_paste(im, rounded(Image.new("RGB", (aw, ah), (12, 16, 28)), 24), 70, 150)
im.convert("RGB").save(f"{OUT}/panel_wide.png")
m_ = Image.new("L", (aw, ah), 0); ImageDraw.Draw(m_).rounded_rectangle((0, 0, aw - 1, ah - 1), 24, fill=255); m_.save(f"{OUT}/mask_audit.png")
manifest["layout"]["audit"] = {"w": aw, "h": ah, "x": 70, "y": 150}

# ---------- B9: the real HubSpot deal on the left, the morning words + QR on the right ----------
im = backdrop()
ph = rounded(fit(Image.open(f"{SAFE}/safe_S9_hubspot_stages.jpg").convert("RGB"), 700, 960), 34)
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
    for y, runs in ((330, [("Nadie se despierta queriendo IA.", s, WHITE)]), (470, [("Tú quieres ", s, WHITE), ("más pacientes.", it, GOLD)])):
        draw_runs(d, (W - runs_w(runs)) // 2, y, runs)
    d.rounded_rectangle((W // 2 - 190, 680, W // 2 - 30, 684), 2, fill=VIOLET); d.rounded_rectangle((W // 2 + 30, 680, W // 2 + 190, 684), 2, fill=GOLD)
    p = qr_plate(300); im.alpha_composite(p, (W - p.width - 70, H - p.height - 60)); return im.convert("RGB")
thesis().save(f"{OUT}/card_s04.png")

def reveal_overlay():   # transparent, over the real Cartagena walled-city footage (no people -> QR on frame)
    im = layer()
    sc_ = Image.new("L", (W, H), 0); ImageDraw.Draw(sc_).rectangle((0, 0, W, H), fill=95); im.paste(Image.new("RGBA", (W, H), (2, 4, 10, 255)), (0, 0), sc_)
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
    im.alpha_composite(lg, (CX - 235, 80))
    m = font(MONO, 22); t = "AI GROWTH OPERATOR · AIDEAZZ AI LAB"; spaced(d, CX - spaced_w(m, t, 6) // 2, 330, t, m, GOLD, 6)
    s, it = font(SERIF, 98), font(ITALIC, 98)
    for y, runs in ((372, [("¿Qué ve la IA cuando", s, WHITE)]), (474, [("mira ", s, WHITE), ("tu negocio?", it, GOLD)])):
        draw_runs(d, CX - runs_w(runs) // 2, y, runs)
    b = manrope(30, b"Medium"); t2 = "Auditoría de visibilidad en IA  ·  34 señales  ·  gratis"
    d.text((CX - tw(b, t2) // 2, 615), t2, font=b, fill=(229, 231, 235))
    f = manrope(50, b"Bold"); label, arrow = "aideazz.xyz/api", "  →"
    pw, ph = tw(f, label) + tw(f, arrow) + 110, 98; x0, y0 = CX - pw // 2, 682
    ring = Image.new("RGBA", (pw + 8, ph + 8)); rd = ImageDraw.Draw(ring)
    for i in range(pw + 8):
        k = i / (pw + 7); rd.line([(i, 0), (i, ph + 8)], fill=(round(255 - 31 * k), round(92 - 59 * k), round(53 + 85 * k), 255))
    mask = Image.new("L", ring.size, 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, pw + 7, ph + 7), (ph + 8) // 2, fill=255)
    im.paste(ring, (x0 - 4, y0 - 4), mask); d = ImageDraw.Draw(im)
    d.rounded_rectangle((x0, y0, x0 + pw, y0 + ph), ph // 2, fill=(11, 16, 32, 255))
    ty = y0 + (ph - (f.getbbox("Ag")[3] - f.getbbox("Ag")[1])) // 2 - f.getbbox("Ag")[1]
    d.text((x0 + 55, ty), label, font=f, fill=WHITE); d.text((x0 + 55 + tw(f, label), ty), arrow, font=f, fill=GOLD)
    sb = font(ITALIC, 52); t4 = "Para clínicas dentales y de cirugía plástica"; d.text((CX - tw(sb, t4) // 2, 828), t4, font=sb, fill=GOLD)
    n2 = manrope(26, b"Medium"); t5 = "Cada respuesta la revisa y aprueba la clínica."; d.text((CX - tw(n2, t5) // 2, 912), t5, font=n2, fill=(214, 217, 226))
    n = manrope(22, b"Regular"); t3 = "Dramatización: personas generadas con IA."; d.text((CX - tw(n, t3) // 2, 1010), t3, font=n, fill=(140, 140, 150))
    qr_block(im, 1440, 140, 560, eyebrow="ESCANEA CON TU CÁMARA", url=False)
    return im.convert("RGB")
end_card().save(f"{OUT}/card_s12.png")

# ---------- captions: brand type, no box; *phrase* = gold italic accent ----------
# s01-s03 from silencedetect + per-segment transcription of med-vo.py's takes (3 Oct); s05 = the villa take; s06-s10 = the yacht takes (villa timings)
CAPS = {
    "s01": [(0.05, 2.75, "Tus próximos pacientes viajan a Colombia *por tratamiento médico:*"),
            (2.75, 4.20, "*implantes dentales para él,*"),
            (4.20, 6.30, "*un procedimiento estético para ella.*"),
            (6.30, 7.90, "No te llaman."),
            (7.90, 9.60, "*Le preguntan a una IA.*")],
    "s02": [(0.05, 3.70, "Suele sugerir las clínicas y los cirujanos *que puede entender.*"),
            (3.70, 7.15, "Si no entiende tu sitio web, *quizá no estés en la lista.*")],
    "s03": [(0.05, 2.24, "Algunos pacientes *te escriben directamente.*"),
            (2.24, 4.20, "Viernes: *estás en una cirugía larga…*"),
            (4.20, 6.54, "…o tu coordinadora *está con otra familia.*"),
            (6.54, 7.78, "Respondes *el lunes.*"),
            (7.78, 10.40, "Ya eligieron *la clínica que respondió primero.*")],
    "s05": [(0.15, 0.95, "*Rebobina.*"),
            (3.45, 6.25, "Esta vez tienes un *AI Growth Operator.*")],
    "s06": [(0.05, 3.88, "Primero, revisa qué puede entender realmente la IA *de tu sitio web.*"),
            (3.88, 6.33, "*34 señales.* Una puntuación."),
            (6.33, 8.00, "Las correcciones *que importan.*")],
    "s07": [(0.05, 2.70, "Cuando ella escribe, *recibe un acuse al instante.*"),
            (2.70, 5.60, "Y ya tienes una respuesta *redactada en tu teléfono.*")],
    "s08": [(0.05, 2.50, "La IA redacta. *Tú decides.*"),
            (2.50, 3.70, "Un toque: *enviado.*"),
            (3.70, 6.40, "Y la conversación queda *registrada en tu CRM.*")],
    "s10": [(0.05, 3.53, "AIdeazz AI Lab *no te vende otro CRM.*"),
            (3.53, 7.70, "Instalamos un AI Growth Operator *dentro de las herramientas que ya usas,*"),
            (7.70, 9.00, "*y lo operamos contigo.*")],
}
CS = 66; CR, CI = font(SERIF, CS), font(ITALIC, CS); MAXW, LH = 1180, 76
def parse(markup):
    out, it_ = [], False
    for part in markup.split("*"):
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
sc = Image.new("RGBA", (W, 330), (0, 0, 0, 0)); sd = ImageDraw.Draw(sc)
for y in range(330): sd.line([(0, y), (1500, y)], fill=(0, 0, 0, int(205 * (y / 329) ** 1.35)))
for x in range(1500, 1560):
    a = 1 - (x - 1500) / 60
    for y in range(330): sc.putpixel((x, y), (0, 0, 0, int(205 * (y / 329) ** 1.35 * a)))
sc.save(f"{OUT}/scrim.png"); manifest["scrim"] = {"file": "scrim.png", "x": 0, "y": H - 330}

# ---------- titles over footage (glass card) ----------
def title(fn, l1, l2, size, left=60, y=60):
    s, it = font(SERIF, size), font(ITALIC, size); r1, r2 = [(l1, s, WHITE)], [(l2, it, GOLD)]
    w_ = max(runs_w(r1), runs_w(r2)); px, py, gap = 64, 34, 10; cw, ch = w_ + 2 * px, 2 * size + gap + 2 * py + 18
    im = glass(cw, ch, 196); d = ImageDraw.Draw(im)
    for k, runs in enumerate((r1, r2)): draw_runs(d, 30 + (cw - runs_w(runs)) // 2, 30 + py - size // 8 + k * (size + gap), runs)
    im.save(f"{OUT}/{fn}"); return {"file": fn, "x": left, "y": y}
manifest["titles"].append({"line": "s03", "t0": 7.80, "t1": None, **title("title_s03.png", "Las buenas oportunidades", "se enfrían en silencio.", 80)})
manifest["a7_card"] = title("card_a7.png", "La IA redacta.", "Tú revisas y decides.", 70, left=None, y=40)
manifest["a7_card"]["x"] = (W - Image.open(f"{OUT}/card_a7.png").width) // 2

def title_question(fn, size=64, left=40, y=40):
    s, it = font(SERIF, size), font(ITALIC, size); r1, r2 = [("Misma familia.", s, WHITE)], [("Misma pregunta a ChatGPT:", it, GOLD)]
    ql = ["Cumplimos 30 años. Él necesita implantes dentales;", "yo considero un procedimiento estético para mí.", "¿Qué clínicas en Medellín atienden bien a pacientes", "de EE. UU. y responden rápido en inglés?"]; qf = manrope(30, b"Medium"); qlh = 40
    px, py, gap = 52, 30, 8; bw, bh = max(tw(qf, l) for l in ql) + 56, len(ql) * qlh + 30
    cw = max(runs_w(r1), runs_w(r2), bw) + 2 * px; ch = 2 * size + gap + 26 + bh + 2 * py + 10
    im = glass(cw, ch, 200); d = ImageDraw.Draw(im); x0 = 30 + px
    draw_runs(d, x0, 30 + py - size // 8, r1); draw_runs(d, x0, 30 + py - size // 8 + size + gap, r2)
    by = 30 + py + 2 * size + gap + 22
    d.rounded_rectangle((x0, by, x0 + bw, by + bh), 26, fill=(244, 244, 244, 255))
    for k, l in enumerate(ql): d.text((x0 + 28, by + 12 + k * qlh), l, font=qf, fill=(20, 20, 24))
    im.save(f"{OUT}/{fn}"); return {"file": fn, "x": left, "y": y}
manifest["titles"].append({"line": "s05", "t0": 2.25, "t1": 6.00, **title_question("title_s05.png")})   # kA2: her face is right, the left is dark

# ---------- opening title: ES large + EN small, upper-left over the real Dallas night aerial ----------
def opening():
    im = layer()
    sc_ = Image.new("L", (W, H), 0); sd_ = ImageDraw.Draw(sc_)
    for x in range(0, 1300): sd_.line([(x, 0), (x, H)], fill=int(165 * (1 - x / 1300) ** 1.3))
    im.paste(Image.new("RGBA", (W, H), (2, 4, 10, 255)), (0, 0), sc_)
    m = font(MONO, 24); LX = 96
    spaced(ImageDraw.Draw(im), LX, 120, "AIDEAZZ AI LAB · AI GROWTH OPERATOR", m, GOLD, 6)
    LINES = (("Le preguntaron a ChatGPT", False), ("antes de escribirle", False), ("a tu clínica.", True))
    sz = 96
    while max(tw(font(ITALIC if g else SERIF, sz), t_) for t_, g in LINES) > 1100: sz -= 2
    s, it = font(SERIF, sz), font(ITALIC, sz); lh = round(sz * 1.02); y = 166
    for t_, g in LINES:
        halo_runs(im, LX, y, [(t_, it if g else s, GOLD if g else WHITE)], blur=12, alpha=215); y += lh
    en = manrope(30, b"Medium"); y += 52
    for k, t_ in enumerate(("They asked ChatGPT before they messaged", "your clinic.")):
        halo_runs(im, LX + 4, y + k * 42, [(t_, en, (226, 228, 236))], blur=8, alpha=200)
    y += 2 * 42 + 22
    d = ImageDraw.Draw(im); d.rounded_rectangle((LX + 4, y, LX + 164, y + 4), 2, fill=VIOLET); d.rounded_rectangle((LX + 204, y, LX + 364, y + 4), 2, fill=GOLD)
    return im
opening().save(f"{OUT}/title_open.png")

# ---------- scene chips (mono, gold on glass) ----------
def chip(fn, text, size=26, tint=GOLD):
    f = font(MONO, size); w_ = spaced_w(f, text, 5) + 64; h_ = size + 34
    im = Image.new("RGBA", (w_ + 40, h_ + 40), (0, 0, 0, 0))
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((20, 26, 20 + w_, 26 + h_), h_ // 2, fill=(0, 0, 0, 150))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10)))
    ImageDraw.Draw(im).rounded_rectangle((20, 20, 20 + w_, 20 + h_), h_ // 2, fill=(9, 14, 30, 205), outline=tint + (170,), width=2)
    spaced(ImageDraw.Draw(im), 52, 20 + (h_ - size) // 2 - 2, text, f, tint, 5)
    im.save(f"{OUT}/{fn}"); manifest["chips"][fn[:-4]] = {"file": fn, "w": im.width, "h": im.height}
for fn, t in (("chip_dallas.png", "DALLAS · JUEVES 23:48"), ("chip_dental.png", "TU CLÍNICA ODONTOLÓGICA · VIERNES 10:00"),
              ("chip_surgery.png", "TU CONSULTORIO DE CIRUGÍA PLÁSTICA · VIERNES 10:00"), ("chip_lunes.png", "LUNES"),
              ("chip_med_nov.png", "MEDELLÍN · NOVIEMBRE"), ("chip_recovery.png", "MEDELLÍN · RECUPERACIÓN"),
              ("chip_cartagena_p2.png", "CARTAGENA · RECUPERACIÓN · DESPUÉS DEL CONTROL FINAL"), ("chip_cartagena.png", "CARTAGENA"),
              ("chip_bogota.png", "BOGOTÁ"),
              ("chip_dental_short.png", "TU CLÍNICA ODONTOLÓGICA · VIERNES"), ("chip_surgery_short.png", "TU CIRUGÍA PLÁSTICA · VIERNES")):
    chip(fn, t)
chip("chip_drama.png", "DRAMATIZACIÓN CON IA", size=22, tint=(220, 223, 232))

# ---------- ICP card: the relocation lanes first, in gold ----------
ICP_ROWS = [("Clínicas odontológicas: implantes dentales y carillas", GOLD), ("Cirugía plástica con pacientes internacionales", GOLD),
            ("Reubicación, visas e inmigración", WHITE), ("Bienes raíces — compra, venta y reventa", WHITE), ("Chárter de yates y villas de lujo", WHITE)]
ICP_CHIPS = ["Pacientes de EE. UU. y Canadá", "Ventas de alto valor", "Conversaciones por WhatsApp"]
ICP_CITIES = "BOGOTÁ · CALI · MEDELLÍN · CARTAGENA"
ICP_FACT = "21.034 extranjeros llegaron a Colombia por tratamiento médico entre enero y agosto de 2026 (+17,6 %) · Migración Colombia vía ANATO"
def icp_card(a0=0.15, z=4.30):   # seconds into the s10 block = the real Bogota / Monserrate aerial (no people)
    X, Y, px = 60, 50, 54; rf = font(SERIF, 58); cf = manrope(26, b"SemiBold"); m = font(MONO, 24); RH = 72
    chips_w = sum(tw(cf, c) + 56 for c in ICP_CHIPS) + 14 * (len(ICP_CHIPS) - 1)
    ff = manrope(20, b"Medium"); cw = max(max(tw(rf, r) for r, _ in ICP_ROWS) + 46, chips_w, tw(ff, ICP_FACT)) + 2 * px; ch = 64 + len(ICP_ROWS) * RH + 24 + 54 + 46 + 104
    bg = layer(); sh = layer(); ImageDraw.Draw(sh).rounded_rectangle((X, Y + 8, X + cw, Y + ch + 8), 30, fill=(0, 0, 0, 150))
    bg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(16)))
    comp(bg, lambda d: d.rounded_rectangle((X, Y, X + cw, Y + ch), 30, fill=(9, 14, 30, 210)))
    comp(bg, lambda d: d.rounded_rectangle((X, Y, X + cw, Y + ch), 30, outline=(255, 255, 255, 42), width=2))
    spaced(ImageDraw.Draw(bg), X + px, Y + 34, "PARA NEGOCIOS COMO", m, GOLD, 7)
    bb = bg.getbbox(); bg.crop(bb).save(f"{OUT}/icp_0.png"); items = [{"a": a0, "z": z, "file": "icp_0.png", "x": bb[0], "y": bb[1]}]
    for i, (r, col) in enumerate(ICP_ROWS):
        im = layer(); d = ImageDraw.Draw(im); y = Y + 86 + i * RH
        d.rounded_rectangle((X + px, y + 28, X + px + 14, y + 32), 2, fill=GOLD)
        d.text((X + px + 34, y), r, font=font(ITALIC if col == GOLD else SERIF, 58), fill=col)
        b = im.getbbox(); im.crop(b).save(f"{OUT}/icp_{i+1}.png")
        items.append({"a": a0 + 0.2 + 0.32 * i, "z": z, "file": f"icp_{i+1}.png", "x": b[0], "y": b[1]})
    im = layer(); x = X + px; y = Y + 86 + len(ICP_ROWS) * RH + 18
    for c in ICP_CHIPS:
        w_ = tw(cf, c) + 56
        comp(im, lambda dd, x=x, w_=w_: dd.rounded_rectangle((x, y, x + w_, y + 50), 25, fill=(237, 184, 103, 34), outline=GOLD, width=2))
        ImageDraw.Draw(im).text((x + 28, y + 9), c, font=cf, fill=GOLD); x += w_ + 14
    b = im.getbbox(); im.crop(b).save(f"{OUT}/icp_6.png")
    items.append({"a": a0 + 0.2 + 0.32 * len(ICP_ROWS) + 0.1, "z": z, "file": "icp_6.png", "x": b[0], "y": b[1]})
    im = layer(); d = ImageDraw.Draw(im); y2 = y + 50 + 26
    spaced(d, X + px, y2, ICP_CITIES, m, GOLD, 6); d.text((X + px, y2 + 46), ICP_FACT, font=ff, fill=(200, 204, 214))
    b = im.getbbox(); im.crop(b).save(f"{OUT}/icp_7.png")
    items.append({"a": a0 + 0.2 + 0.32 * len(ICP_ROWS) + 0.35, "z": z, "file": "icp_7.png", "x": b[0], "y": b[1]})
    return items
manifest["absolute"] += [dict(it, line="s10") for it in icp_card()]

json.dump(manifest, open(f"{OUT}/manifest.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(manifest["captions"]), "captions,", len(manifest["chips"]), "chips,", len([f for f in os.listdir(OUT) if f.startswith("split_")]), "split frames ->", OUT)
