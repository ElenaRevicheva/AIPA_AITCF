# Medical-tourism film (ICP #5, 3 Oct 2026): SAFE versions of Elena's real phone screenshots (crop + blur the private bits),
# plus the WhatsApp recreation bubbles. Copy of reloc-safe-screens.py; mandatory blur list = plan §5 (emails, her name, the
# lead id, timestamps, the deal prefix and stage, the Calendly link, the fictional name in Gmail/HubSpot, other leads).
# Coordinates are measured on the 923x2000 preview of the 1080x2340 phone screenshots and scaled. Runs LOCALLY (Pillow).
# usage: python med-safe-screens.py <uploads dir> <out dir>
import os, sys
from PIL import Image, ImageFilter, ImageDraw
UP, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)

def safe(src, out, crop, blurs, radius=16):
    im = Image.open(f"{UP}/{src}").convert("RGB"); k = im.width / 923
    for (x0, y0, x1, y1) in blurs:
        b = tuple(round(v * k) for v in (x0, y0, x1, y1)); im.paste(im.crop(b).filter(ImageFilter.GaussianBlur(radius)), b[:2])
    c = tuple(round(v * k) for v in crop); im.crop(c).save(f"{OUT}/{out}", quality=94); print(out, c)

# Gmail: the inquiry copy that lands in the business inbox the moment the form is sent (the lead id, email, name, time blurred)
safe("0dbb8d23-image.jpg", "safe_S4_inquiry_copy.jpg", (0, 240, 923, 1420),
     [(420, 262, 700, 316), (45, 392, 300, 548), (270, 450, 520, 496), (380, 664, 668, 722), (25, 724, 650, 792),
      (145, 840, 420, 890), (140, 922, 600, 976)])
# Telegram: the new-lead card + the start of the drafted reply. The test inbox has written before, so the draft opens
# "good to hear from you AGAIN" - blurred after "Hi Diane," so the film reads as a first contact (plan §3).
safe("e8f9cc58-image.jpg", "safe_S4_tg_card_draft.jpg", (20, 210, 808, 830),
     [(55, 266, 615, 318), (238, 764, 760, 824)])
# Telegram: SENT (email + timestamp blurred; the Resend id and the body are cropped off)
safe("458431a7-image.jpg", "safe_S5_tg_sent.jpg", (25, 382, 800, 700),
     [(55, 450, 770, 556)])
# Gmail: the instant acknowledgement the patient receives (the fictional name and the time blurred)
safe("99a15787-image.jpg", "safe_S4_gmail_ack.jpg", (0, 240, 923, 1200),
     [(360, 470, 495, 516), (130, 676, 340, 722)])
# HubSpot: the deal moved to Sent with the reply logged (title prefix, stage, "by Elena Revicheva" and timestamps blurred)
safe("8321e248-image.jpg", "safe_S5_hubspot_activity.jpg", (0, 95, 923, 1395),
     [(130, 140, 795, 200), (58, 450, 866, 500), (60, 952, 520, 1002), (68, 1010, 368, 1060),
      (205, 1096, 672, 1144)])   # the last box: "good to hear from you again" (the test inbox wrote before)

# HubSpot, line 9 ("every morning you know who's new, who's warm..."): the deal header from the SAME screenshot - the
# stage stays readable ("Sent - passive wait"), only the owner's name inside it, the title prefix and the name are blurred.
safe("8321e248-image.jpg", "safe_S9_hubspot_deal.jpg", (0, 95, 923, 700),
     [(130, 140, 795, 200), (556, 452, 702, 498)])

# ---- WhatsApp recreation (tagged "Recreación" on screen). Elena sent all five lines to herself, so every bubble is green
# (outgoing). The clinic's Monday line stays green on the right; the couple's reply and the T3 recovery message become
# INCOMING (white, left) - same words, time and ticks painted out. Nothing is retyped: the text pixels are hers.
WA = "e99d74bb-image.jpg"; GREEN = (216, 253, 210); BG = (239, 234, 226)
im = Image.open(f"{UP}/{WA}").convert("RGB"); k = im.width / 923
def near(c, ref, tol=22): return all(abs(a - r) < tol for a, r in zip(c, ref))
def bubble(box, incoming):
    b = im.crop(tuple(round(v * k) for v in box)).convert("RGB"); px = b.load()
    # tighten the crop to the bubble itself (the green area), so no wallpaper comes along
    xs = [x for x in range(b.width) if sum(near(px[x, y], GREEN) for y in range(0, b.height, 3)) > b.height // 9]
    ys = [y for y in range(b.height) if sum(near(px[x, y], GREEN) for x in range(0, b.width, 3)) > b.width // 9]
    b = b.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1)); px = b.load()
    w, h = b.size
    # paint out the time + ticks in the bottom-right corner of the bubble
    ImageDraw.Draw(b).rectangle((w - round(190 * k), h - round(52 * k), w - round(14 * k), h - round(8 * k)), fill=GREEN)
    if incoming:
        for y in range(h):
            for x in range(w):
                r, g, bl = px[x, y]
                if abs(r - GREEN[0]) < 22 and abs(g - GREEN[1]) < 22 and abs(bl - GREEN[2]) < 22: px[x, y] = (255, 255, 255)
    return b
def thread(parts, out, width=1000):
    pad = 26; bs = [(bubble(bx, inc), inc) for bx, inc in parts]
    H = pad + sum(b.height + pad for b, _ in bs); canvas = Image.new("RGB", (width, H), BG); y = pad
    for b, inc in bs:
        canvas.paste(b, (pad if inc else width - b.width - pad, y)); y += b.height + pad
    canvas.save(f"{OUT}/{out}", quality=94); print(out, canvas.size)
# bubble boxes on the 923x2000 preview (x0, y0, x1, y1)
DENT_OWNER, DENT_REPLY = (138, 966, 882, 1086), (138, 1094, 882, 1216)
SURG_OWNER, SURG_REPLY = (138, 1224, 882, 1344), (138, 1352, 882, 1472)
T3_MSG = (138, 1482, 882, 1738)
thread([(DENT_OWNER, False), (DENT_REPLY, True)], "safe_S2b_wa_dental.jpg")
thread([(SURG_OWNER, False), (SURG_REPLY, True)], "safe_S2b_wa_surgery.jpg")
thread([(T3_MSG, True)], "safe_T3_wa_recovery.jpg")
