# AIGO films -> Instagram Reels (4 Oct 2026, Elena: "explore if not only images but videos ... reside our 5 videos to fit insta
# format"). One 1080x1920 transparent overlay per film: top band = brand + the film's slogan (ES large, EN small, the
# thumbnail system), middle 1080x608 left open for the 16:9 film (y 656-1264), bottom band = the hook chip + the CTA + a
# per-film AI disclosure. Text stays inside Instagram's Reels safe zone (clear of the top ~250 px and the bottom ~340 px,
# where the app draws its UI). aigo-ig-reels.sh composites it over the film on a blurred fill. Runs LOCALLY (Pillow).
# usage: python aigo-ig-reel-overlays.py <fonts dir> <out dir>
import os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FD, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)
W, H, FY, FH = 1080, 1920, 656, 608
TOP = 236   # logo top: below the Reels UI band, leaves the slogan block clear of the film at y 656
GOLD, WHITE, GREY, SLATE, ORANGE = (237, 184, 103), (255, 255, 255), (200, 204, 214), (51, 71, 91), (255, 92, 53)
MONO = "C:/Windows/Fonts/consola.ttf"
def font(p, s): return ImageFont.truetype(p, s)
def manrope(s, wt=b"SemiBold"):
    f = ImageFont.truetype(f"{FD}/Manrope-var.ttf", s); f.set_variation_by_name(wt); return f
def tw(f, t): return f.getbbox(t)[2]
def spaced(d, x, y, t, f, fill, track):
    for ch in t: d.text((x, y), ch, font=f, fill=fill); x += tw(f, ch) + track
def spaced_w(f, t, track): return sum(tw(f, c) + track for c in t) - track
def halo(im, xy, t, f, fill, blur=8, a=210):
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).text((xy[0] + 2, xy[1] + 4), t, font=f, fill=(0, 0, 0, a))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur))); ImageDraw.Draw(im).text(xy, t, font=f, fill=fill)

FILMS = {
 "yacht":   dict(l1="Le preguntó", l2="a la IA primero.", en="She asked AI first.", chip="¿Tu yate estaba en la lista?",
                 disc="Personas generadas con IA · dramatización  ·  AI-generated people"),
 "villa":   dict(l1="Le preguntó", l2="a la IA primero.", en="She asked AI before she booked.", chip="¿Tu villa estaba en la lista?",
                 disc="Personas generadas con IA · dramatización  ·  AI-generated people"),
 "reloc":   dict(l1="Le preguntaron", l2="a la IA primero.", en="They asked AI first.", chip="¿Estabas en la lista?",
                 disc="Personas generadas con IA · dramatización  ·  AI-generated people"),
 "medtour": dict(l1="Le preguntaron", l2="a la IA primero.", en="They asked AI first.", chip="¿Estaba tu clínica en la lista?",
                 disc="Dramatización · personas generadas con IA · no es consejo médico"),
 "api":     dict(l1="¿La IA encuentra", l2="tu negocio?", en="Can AI find your business?", chip="34 señales · una puntuación",
                 disc="Una persona generada con IA · la auditoría es real"),
}
def overlay(key, f):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    g = Image.new("L", (W, H), 0); gd = ImageDraw.Draw(g)   # dark gradients behind the text bands only
    for y in range(0, FY):
        gd.line([(0, y), (W, y)], fill=int(205 * min(1, (FY - y) / 220 + 0.35)))
    for y in range(FY + FH, H):
        gd.line([(0, y), (W, y)], fill=int(205 * min(1, (y - FY - FH) / 220 + 0.35)))
    im.paste(Image.new("RGBA", (W, H), (3, 7, 17, 255)), (0, 0), g)
    d = ImageDraw.Draw(im)
    lg = Image.open(f"{FD}/brand_logo.png").convert("RGBA"); lg = lg.crop(lg.getbbox()); lw = 300
    lg = lg.resize((lw, round(lg.height * lw / lg.width)), Image.LANCZOS); im.alpha_composite(lg, ((W - lw) // 2, TOP))
    m = font(MONO, 22); t = "AI GROWTH OPERATOR · AIDEAZZ AI LAB"; spaced(d, (W - spaced_w(m, t, 5)) // 2, TOP + lg.height + 18, t, m, GOLD, 5)
    size = 86
    while max(tw(font(f"{FD}/InstrumentSerif-Regular.ttf", size), f["l1"]), tw(font(f"{FD}/InstrumentSerif-Italic.ttf", size), f["l2"])) > 980: size -= 2
    s, it = font(f"{FD}/InstrumentSerif-Regular.ttf", size), font(f"{FD}/InstrumentSerif-Italic.ttf", size)
    y = TOP + lg.height + 52
    halo(im, ((W - tw(s, f["l1"])) // 2, y), f["l1"], s, WHITE); halo(im, ((W - tw(it, f["l2"])) // 2, y + round(size * 0.98)), f["l2"], it, GOLD)
    en = manrope(30, b"Medium"); halo(im, ((W - tw(en, f["en"])) // 2, y + round(size * 2.05)), f["en"], en, GREY, blur=6, a=190)
    # bottom band: the white HubSpot-style chip with the hook question, then the CTA, then the disclosure (all above y 1580)
    d = ImageDraw.Draw(im); cf = manrope(34); cw = tw(cf, f["chip"]) + 92; ch = 72; cx, cy = (W - cw) // 2, FY + FH + 34
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((cx + 2, cy + 8, cx + cw + 2, cy + ch + 8), ch // 2, fill=(0, 0, 0, 150))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(8))); d = ImageDraw.Draw(im)
    d.rounded_rectangle((cx, cy, cx + cw, cy + ch), ch // 2, fill=WHITE, outline=(203, 214, 226), width=2)
    d.ellipse((cx + 28, cy + ch // 2 - 9, cx + 46, cy + ch // 2 + 9), fill=ORANGE); d.text((cx + 62, cy + (ch - 34) // 2 - 6), f["chip"], font=cf, fill=SLATE)
    a1 = manrope(34, b"Medium"); t1 = "Auditoría de visibilidad en IA, gratis"; halo(im, ((W - tw(a1, t1)) // 2, cy + ch + 46), t1, a1, WHITE, blur=6)
    a2 = manrope(52, b"Bold"); t2 = "aideazz.xyz/api"; halo(im, ((W - tw(a2, t2)) // 2, cy + ch + 98), t2, a2, GOLD, blur=6)
    a3 = manrope(24, b"Regular"); t3 = f["disc"]
    while tw(a3, t3) > 1000: a3 = manrope(a3.size - 1, b"Regular")
    halo(im, ((W - tw(a3, t3)) // 2, cy + ch + 190), t3, a3, GREY, blur=5, a=200)
    out = f"{OUT}/reel_overlay_{key}.png"; im.save(out); return out

for k, f in FILMS.items(): print(overlay(k, f))
