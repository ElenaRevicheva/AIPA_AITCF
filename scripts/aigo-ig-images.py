# AIGO films -> Instagram (4 Oct 2026, Elena: promote the 5 films on Instagram, additively, through a NEW Make scenario).
# Builds one 1080x1350 (4:5) JPEG per film and language from the published YouTube thumbnails (1280x720): brand band on top,
# the thumbnail inset to 1000 px (the 3:4 profile grid crops ~34 px per side, the slogan sits near the edge), a per-film AI
# disclosure + the CTA at the bottom. Brand system = the films' (Instrument Serif, Manrope, mono eyebrow, dot grid on #030711).
# Runs LOCALLY (Pillow; the fonts are not on Oracle). usage: python aigo-ig-images.py <fonts dir> <thumbs dir> <out dir>
import os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FD, TH, OUT = sys.argv[1], sys.argv[2], sys.argv[3]; os.makedirs(OUT, exist_ok=True)
W, H = 1080, 1350
BG, GOLD, WHITE, GREY = (3, 7, 17), (237, 184, 103), (255, 255, 255), (190, 194, 206)
MONO = "C:/Windows/Fonts/consola.ttf"
def font(p, s): return ImageFont.truetype(p, s)
def manrope(s, wt=b"SemiBold"):
    f = ImageFont.truetype(f"{FD}/Manrope-var.ttf", s); f.set_variation_by_name(wt); return f
def tw(f, t): return f.getbbox(t)[2]
def spaced(d, x, y, t, f, fill, track):
    for ch in t: d.text((x, y), ch, font=f, fill=fill); x += tw(f, ch) + track
def spaced_w(f, t, track): return sum(tw(f, c) + track for c in t) - track

# per-film disclosure (not one line for all: the /api film shows one AI person and a REAL audit; medtour is health content)
DISC = {
 "yacht":  {"en": "AI-generated people · dramatization", "es": "Personas generadas con IA · dramatización"},
 "villa":  {"en": "AI-generated people · dramatization", "es": "Personas generadas con IA · dramatización"},
 "reloc":  {"en": "AI-generated people · dramatization", "es": "Personas generadas con IA · dramatización"},
 "medtour": {"en": "Dramatization · AI-generated people · not medical advice", "es": "Dramatización · personas generadas con IA · no es consejo médico"},
 "api":    {"en": "One AI-generated person · the audit shown is real", "es": "Una persona generada con IA · la auditoría es real"},
}
CTA = {"en": "Free AI visibility audit · aideazz.xyz/api", "es": "Auditoría de visibilidad en IA gratis · aideazz.xyz/api"}
FILM_LINE = {"en": "Full film on YouTube · link in bio", "es": "Película completa en YouTube · link en la bio"}
SRC = {"yacht": "Yacht", "villa": "Villa", "reloc": "Relocation", "medtour": "Medical Tourism", "api": "API"}

def backdrop():
    im = Image.new("RGBA", (W, H), BG + (255,))
    g = Image.new("RGBA", (W, H), (0, 0, 0, 0)); gd = ImageDraw.Draw(g)
    gd.ellipse((-420, -520, 760, 560), fill=(157, 140, 255, 44)); gd.ellipse((420, 820, 1500, 1800), fill=GOLD + (24,))
    im.alpha_composite(g.filter(ImageFilter.GaussianBlur(170)))
    dots = Image.new("RGBA", (W, H), (0, 0, 0, 0)); dd = ImageDraw.Draw(dots)
    for y in range(14, H, 28):
        for x in range(14, W, 28): dd.ellipse((x - 1, y - 1, x + 1, y + 1), fill=(255, 255, 255, 28))
    im.alpha_composite(dots); return im

def card(film, lang):
    im = backdrop(); d = ImageDraw.Draw(im)
    lg = Image.open(f"{FD}/brand_logo.png").convert("RGBA"); lg = lg.crop(lg.getbbox()); lw = 300
    lg = lg.resize((lw, round(lg.height * lw / lg.width)), Image.LANCZOS); im.alpha_composite(lg, ((W - lw) // 2, 70))
    m = font(MONO, 24); t = "AI GROWTH OPERATOR · AIDEAZZ AI LAB"; spaced(d, (W - spaced_w(m, t, 5)) // 2, 70 + lg.height + 28, t, m, GOLD, 5)
    th = Image.open(f"{TH}/{SRC[film]} thumbnail {lang.upper()}.jpg").convert("RGB")
    tw_ = 1000; th = th.resize((tw_, round(th.height * tw_ / th.width)), Image.LANCZOS)
    mask = Image.new("L", th.size, 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, th.width - 1, th.height - 1), 26, fill=255)
    ty = 330; sh = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((40, ty + 14, 40 + tw_, ty + 14 + th.height), 26, fill=(0, 0, 0, 170))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(20))); im.paste(th, ((W - tw_) // 2, ty), mask)
    d = ImageDraw.Draw(im); y = ty + th.height + 70
    f1 = manrope(40, b"Bold"); t1 = CTA[lang]
    while tw(f1, t1) > 980: f1 = manrope(f1.size - 2, b"Bold")
    d.text(((W - tw(f1, t1)) // 2, y), t1, font=f1, fill=WHITE); y += 78
    f2 = manrope(32, b"Medium"); t2 = FILM_LINE[lang]; d.text(((W - tw(f2, t2)) // 2, y), t2, font=f2, fill=GOLD); y += 120
    f3 = manrope(26, b"Regular"); t3 = DISC[film][lang]
    while tw(f3, t3) > 1000: f3 = manrope(f3.size - 1, b"Regular")
    d.text(((W - tw(f3, t3)) // 2, H - 92), t3, font=f3, fill=GREY)
    out = f"{OUT}/aigo-ig-{film}-{lang}-v1.jpg"; im.convert("RGB").save(out, quality=92, optimize=True); return out

for film in ("yacht", "villa", "reloc", "medtour", "api"):
    for lang in ("en", "es"): print(card(film, lang))
