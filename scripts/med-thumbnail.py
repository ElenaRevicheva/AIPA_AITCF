# MEDICAL-TOURISM film (ICP #5, 3 Oct 2026) - YouTube thumbnail EN + ES on the dental-chair keyframe kT1 (plan §8: the thumbnail
# must say "medical" at a glance). Copy of reloc-thumbnail.py with the layout flipped: text column LEFT, the dentist and the
# patient on the RIGHT (the frame is reframed by layout, never mirrored - a mirror moves the wedding bands). Original header:
# AI Growth Operator promo - YouTube thumbnail v2, EN + ES (Elena 30 Sep: "stylish - like HubSpot UI and my own website").
# Website half: Instrument Serif headline with the gold italic accent, letter-spaced mono eyebrow, dot grid on #030711.
# HubSpot half: the white rounded status chip (slate text, orange status dot) carrying the hook question.
# usage: python aigo-promo-thumbnail.py <dir with k_thumb2.jpg, fonts, brand_logo.png> <out_dir>
import os, sys
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

D, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)
W, H = 1280, 720
GOLD, SLATE, ORANGE = (237, 184, 103), (51, 71, 91), (255, 92, 53)
MONO = "C:/Windows/Fonts/consola.ttf"
def f(path, size): return ImageFont.truetype(path, size)
def manrope(size, wt=b"SemiBold"):
    x = ImageFont.truetype(f"{D}/Manrope-var.ttf", size); x.set_variation_by_name(wt); return x
def tw(font, t): return font.getbbox(t)[2]

def base():
    im = Image.open(f"{D}/med_thumb_base.jpg").convert("RGB").resize((W, H), Image.LANCZOS)
    im = ImageEnhance.Contrast(im).enhance(1.08).convert("RGBA")
    shade = Image.new("L", (W, H), 0); g = ImageDraw.Draw(shade)
    for x in range(W): g.line([(x, 0), (x, H)], fill=int(max(0, min(1, (760 - x) / 330)) * 230))
    im = Image.composite(Image.new("RGBA", (W, H), (3, 7, 17, 255)), im, shade)
    dots = Image.new("RGBA", (W, H), (0, 0, 0, 0)); dd = ImageDraw.Draw(dots)
    for y in range(12, H, 24):
        for x in range(12, W, 24):
            a = int(max(0, min(1, (600 - x) / 250)) * 30)
            if a: dd.ellipse((x - 1, y - 1, x + 1, y + 1), fill=(255, 255, 255, a))
    im.alpha_composite(dots); return im

def halo_text(im, xy, text, font, fill):
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).text((xy[0] + 3, xy[1] + 5), text, font=font, fill=(0, 0, 0, 200))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(7))); ImageDraw.Draw(im).text(xy, text, font=font, fill=fill)

def make(lang, eyebrow, l1, l2, chip, name):
    im = base(); X, R = 56, 600
    d = ImageDraw.Draw(im); m = f(MONO, 21); x = X
    for ch in eyebrow: d.text((x, 150), ch, font=m, fill=GOLD); x += tw(m, ch) + 5
    size = 124                                                        # largest serif size where both lines fit the column
    while tw(f(f"{D}/InstrumentSerif-Italic.ttf", size), l2) > R - X or tw(f(f"{D}/InstrumentSerif-Regular.ttf", size), l1) > R - X: size -= 2
    halo_text(im, (X, 188), l1, f(f"{D}/InstrumentSerif-Regular.ttf", size), (255, 255, 255))
    halo_text(im, (X, 188 + int(size * 1.02)), l2, f(f"{D}/InstrumentSerif-Italic.ttf", size), GOLD)
    y = 188 + int(size * 2.2) + 26; cf = manrope(25); cw = tw(cf, chip) + 78; ch_ = 58
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((X + 2, y + 6, X + cw + 2, y + ch_ + 6), ch_ // 2, fill=(0, 0, 0, 150))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(8)))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((X, y, X + cw, y + ch_), ch_ // 2, fill=(255, 255, 255), outline=(203, 214, 226), width=2)
    d.ellipse((X + 24, y + ch_ // 2 - 7, X + 38, y + ch_ // 2 + 7), fill=ORANGE)
    d.text((X + 52, y + (ch_ - 25) // 2 - 5), chip, font=cf, fill=SLATE)
    lg = Image.open(f"{D}/brand_logo.png").convert("RGBA"); lg = lg.crop(lg.getbbox()); lw = 230
    lg = lg.resize((lw, round(lg.height * lw / lg.width)), Image.LANCZOS); im.alpha_composite(lg, (X - 6, H - lg.height - 40))
    im.convert("RGB").save(f"{OUT}/{name}", quality=93); print(name, "serif", size)

make("en", "AI GROWTH OPERATOR · CLINICS", "They asked", "AI first.", "Was your clinic on the list?", "MEDTOUR_thumbnail_EN.jpg")
make("es", "AI GROWTH OPERATOR · CLÍNICAS", "Le preguntaron", "a la IA primero.", "¿Estaba tu clínica en la lista?", "MEDTOUR_thumbnail_ES.jpg")
