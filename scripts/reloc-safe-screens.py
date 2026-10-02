# Relocation film (ICP #3, 2 Oct 2026): make the SAFE versions of Elena's real phone screenshots (crop + blur the private bits).
# Mandatory blur list (plan §5): emails, her name, the lead id, timestamps, the deal prefix, the bot name/avatar, other leads.
# Coordinates are measured on the 923x2000 preview of the 1080x2340 phone screenshots and scaled. Runs LOCALLY (Pillow).
# usage: python reloc-safe-screens.py <uploads dir> <out dir>
import os, sys
from PIL import Image, ImageFilter
UP, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)

def safe(src, out, crop, blurs, radius=16):
    im = Image.open(f"{UP}/{src}").convert("RGB"); k = im.width / 923
    for (x0, y0, x1, y1) in blurs:
        b = tuple(round(v * k) for v in (x0, y0, x1, y1)); im.paste(im.crop(b).filter(ImageFilter.GaussianBlur(radius)), b[:2])
    c = tuple(round(v * k) for v in crop); im.crop(c).save(f"{OUT}/{out}", quality=94); print(out, c)

# Zoho: the inquiry copy that lands in her business inbox the moment the form is sent
safe("8ff6c4f2-image.jpg", "safe_S4_zoho_inquiry.jpg", (0, 240, 923, 1460),
     [(400, 262, 715, 314), (265, 448, 505, 496), (380, 660, 668, 727), (20, 724, 668, 796), (145, 843, 425, 889), (140, 925, 600, 973)])
# Telegram: the new-lead card + the drafted reply + Send / Edit / Skip (no header, no other leads)
safe("7680b49d-image.jpg", "safe_S4_tg_card_draft.jpg", (20, 362, 808, 1602),
     [(305, 376, 625, 422), (45, 423, 615, 474), (296, 878, 566, 927), (660, 1432, 780, 1478)])
# Telegram: SENT (email, timestamp and the Resend id blurred)
safe("49936a98-image.jpg", "safe_S5_tg_sent.jpg", (25, 682, 806, 1604),
     [(292, 698, 600, 748), (45, 748, 668, 803), (45, 800, 600, 854), (45, 898, 765, 1152), (660, 1552, 780, 1598)])
# Gmail: the reply that reached the client (sender name + avatar + time blurred: they carry Elena's name)
safe("ec35247b-image.jpg", "safe_S5_gmail_reply.jpg", (0, 262, 923, 852),
     [(52, 422, 180, 550), (205, 428, 450, 484), (460, 432, 585, 478)])
# HubSpot: the deal moved to Sent with the reply logged (title prefix, "Elena" and timestamps blurred)
safe("b70be801-image.jpg", "safe_S5_hubspot_activity.jpg", (0, 95, 923, 1352),
     [(128, 140, 795, 200), (515, 452, 828, 498), (62, 905, 455, 960), (66, 965, 356, 1013)])
