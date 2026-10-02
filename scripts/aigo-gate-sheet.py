# Gate contact sheet: python3 sheet.py out.jpg "Title" id:Label id:Label ...   (tiles from img/<id>.jpg, 3:4, labelled underneath)
import sys
from PIL import Image, ImageDraw, ImageFont
out, title, items = sys.argv[1], sys.argv[2], [a.split(":", 1) for a in sys.argv[3:]]
W, H, PAD, LAB = 600, 800, 24, 64
cols = min(4, len(items)); rows = (len(items) + cols - 1) // cols
sheet = Image.new("RGB", (cols * (W + PAD) + PAD, 90 + rows * (H + LAB + PAD) + PAD), (18, 16, 22))
d = ImageDraw.Draw(sheet)
try:
    f1 = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 40); f2 = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 30)
except Exception:
    f1 = f2 = ImageFont.load_default()
d.text((PAD, 24), title, fill=(232, 200, 120), font=f1)
for i, (iid, lab) in enumerate(items):
    r, c = divmod(i, cols); x, y = PAD + c * (W + PAD), 90 + r * (H + LAB + PAD)
    im = Image.open(f"img/{iid}.jpg").convert("RGB"); im.thumbnail((W, H)); sheet.paste(im, (x + (W - im.width) // 2, y))
    d.text((x, y + H + 12), lab, fill=(240, 240, 240), font=f2)
sheet.save(out, quality=90); print(out, sheet.size)
