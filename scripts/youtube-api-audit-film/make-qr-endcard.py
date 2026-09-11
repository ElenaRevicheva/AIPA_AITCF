#!/usr/bin/env python3
"""Cinematic 1920×1080 QR end card for the /api YouTube film.

Encodes the same CTA YouTube gets in the description. The PNG is the video
outro; watch.html wraps it in an <a> so the QR is actually clickable there.
YouTube itself cannot click a pixel — Elena adds an End Screen over these
last seconds in Studio.
"""
from __future__ import annotations

from pathlib import Path

import qrcode
from PIL import Image, ImageDraw, ImageFilter, ImageFont

CTA = "https://aideazz.xyz/api?utm_source=youtube&utm_medium=video&utm_campaign=api-audit-cta"
HERE = Path(__file__).resolve().parent
OUT_QR = HERE / "qr" / "api-cta-qr.png"
OUT_CARD = HERE / "qr" / "api-cta-endcard.png"

BG = (8, 4, 18)
CYAN = (125, 255, 251)
MAGENTA = (255, 79, 216)
CITRUS = (255, 179, 71)
WHITE = (248, 248, 252)
MUTED = (180, 176, 196)


def font(size: int, mono: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf" if mono else "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf" if mono else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for p in candidates:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def make_qr(box: int = 47) -> Image.Image:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=box,
        border=2,
    )
    qr.add_data(CTA)
    qr.make(fit=True)
    raw = qr.make_image(fill_color=(8, 4, 18), back_color=(125, 255, 251)).convert("RGB")
    # Pad into a rounded-ish plate with magenta hairline.
    plate = Image.new("RGB", (raw.size[0] + 72, raw.size[1] + 72), (18, 10, 36))
    plate.paste(raw, (36, 36))
    return plate


def compose_card(qr: Image.Image) -> Image.Image:
    W, H = 1920, 1080
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    # Soft magenta/cyan glows behind the QR.
    glow = Image.new("RGB", (W, H), BG)
    g = ImageDraw.Draw(glow)
    g.ellipse((980, 80, 1860, 980), fill=(40, 12, 70))
    g.ellipse((-200, 600, 700, 1300), fill=(12, 50, 70))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(80)), 0.85)
    draw = ImageDraw.Draw(img)

    qr_h = 780
    qr_r = qr.resize((qr_h, qr_h), Image.Resampling.LANCZOS)
    img.paste(qr_r, (1040, (H - qr_h) // 2))

    title = font(54, mono=True)
    sub = font(28)
    urlf = font(22, mono=True)
    tiny = font(18)

    draw.text((96, 220), "SCAN  ·  AUDIT  ·  FREE", font=title, fill=CYAN)
    draw.text((96, 310), "Can AI find and cite you?", font=sub, fill=WHITE)
    draw.text((96, 370), "Paste any URL. 34 signals. No signup.", font=sub, fill=MUTED)
    # URL as readable text so the CTA works even if nobody scans.
    draw.rounded_rectangle((90, 470, 980, 560), radius=18, outline=CITRUS, width=2)
    draw.text((112, 498), "aideazz.xyz/api", font=font(36, mono=True), fill=CITRUS)
    draw.text((96, 600), CTA.replace("https://", ""), font=urlf, fill=MUTED)
    draw.text((96, 860), "AIDEAZZ LAB  ·  11.09.2026", font=tiny, fill=MAGENTA)
    return img


def main() -> None:
    HERE.joinpath("qr").mkdir(parents=True, exist_ok=True)
    qr = make_qr()
    qr.save(OUT_QR)
    card = compose_card(qr)
    card.save(OUT_CARD, quality=95)
    print(f"wrote {OUT_QR} {OUT_QR.stat().st_size}")
    print(f"wrote {OUT_CARD} {OUT_CARD.stat().st_size} {card.size}")
    print(f"cta {CTA}")


if __name__ == "__main__":
    main()
