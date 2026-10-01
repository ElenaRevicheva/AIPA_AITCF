"""Render the deck in both languages:
    outlook.html    -> Elena_Revicheva_Professional_Outlook_2026.pdf     (English)
    outlook-es.html -> Elena_Revicheva_Professional_Outlook_2026_ES.pdf  (Spanish; built by make-es.py)

1. Each slide's photographic background (+ .bake layers) is screenshotted alone (?bg=N) at 2x and
   saved as bg/sN.jpg. Soft alpha overlays exported as PDF shadings draw hairline artifacts in
   some viewers, so backgrounds are raster on purpose.
2. The deck prints over those JPEGs (?raster=1). Text, cards, icons and links stay vector,
   so the PDF is searchable and every link is clickable.
Usage: python make-es.py && python render.py   (needs Chrome or Edge, Pillow, PyMuPDF for the check)
"""
import os, subprocess
from pathlib import Path
from PIL import Image
import fitz

HERE = Path(__file__).resolve().parent
DECKS = [('outlook.html', 'Elena_Revicheva_Professional_Outlook_2026.pdf'),
         ('outlook-es.html', 'Elena_Revicheva_Professional_Outlook_2026_ES.pdf')]
SLIDES = 8
BROWSER = next(p for p in [os.environ.get('CHROME_PATH'),
                           r'C:\Program Files\Google\Chrome\Application\chrome.exe',
                           r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
                           '/usr/bin/google-chrome', '/usr/bin/chromium'] if p and os.path.exists(p))
BASE = [BROWSER, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=8000']

def run(args):
    subprocess.run(BASE + args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

(HERE / 'bg').mkdir(exist_ok=True)
for src_name, out_name in DECKS:
    src = (HERE / src_name).as_uri()
    out = HERE / out_name
    # Backgrounds are re-shot per deck: both decks share bg/, and a layout change in one
    # language must never print over the other language's backgrounds.
    for n in range(1, SLIDES + 1):
        png = HERE / 'bg' / f's{n}.png'
        run(['--window-size=1600,900', '--force-device-scale-factor=2', f'--screenshot={png}', f'{src}?bg={n}'])
        im = Image.open(png).convert('RGB')
        assert im.size == (3200, 1800), f'{src_name} slide {n}: screenshot is {im.size}'
        im.save(HERE / 'bg' / f's{n}.jpg', 'JPEG', quality=82, optimize=True)
        png.unlink()

    run(['--no-pdf-header-footer', f'--print-to-pdf={out}', f'{src}?raster=1'])

    doc = fitz.open(out)
    assert len(doc) == SLIDES, f'{out_name}: expected {SLIDES} pages, got {len(doc)}'
    links = sorted({l['uri'] for p in doc for l in p.get_links() if l.get('uri')})
    print(f'{out_name}: {len(doc)} pages, {out.stat().st_size // 1024} KB')
    print('  links:', *links, sep='\n    ')
