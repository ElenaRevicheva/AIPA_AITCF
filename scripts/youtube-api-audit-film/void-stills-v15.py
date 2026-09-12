#!/usr/bin/env python3
"""v15 stills: whole + cut fruit on a black void.

The /api hero lesson (aideazz 15f35b6): a grey studio wall in the still becomes
grey in the film. Mask onto #08050e HERE, before anyone shoots motion.
"""
from __future__ import annotations

import json
import os
import re
import ssl
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEST_DIR = Path(os.environ.get("API_FILM_FRUIT_DIR", HERE / "fruit"))
UA = "AIdeazzApiFilmV15/1.0 (https://aideazz.xyz/portfolio; aipa@aideazz.xyz)"
BANNED = re.compile(r"grape|pomegranate|passionfruit|maracuya|vine|raisin", re.I)
CTX = ssl.create_default_context()

FRUIT = [
    {
        "id": "mango",
        "whole": "v15-mango-whole.jpg",
        "cut": "v15-mango-cut.jpg",
        "must": re.compile(r"mango", re.I),
        "whole_q": ["whole ripe mango fruit", "Mangifera indica whole fruit"],
        "cut_q": ["mango fruit cut open cross section", "sliced ripe mango golden flesh"],
    },
    {
        "id": "papaya",
        "whole": "v15-papaya-whole.jpg",
        "cut": "v15-papaya-cut.jpg",
        "must": re.compile(r"papaya|carica", re.I),
        "whole_q": ["whole papaya fruit Carica", "ripe papaya whole"],
        "cut_q": ["papaya fruit cut in half black seeds", "papaya cross section"],
    },
    {
        "id": "dragon",
        "whole": "v15-dragon-whole.jpg",
        "cut": "v15-dragon-cut.jpg",
        "must": re.compile(r"dragon|pitaya|hylocereus|pitahaya", re.I),
        "whole_q": ["whole dragon fruit pitaya", "Hylocereus undatus whole fruit"],
        "cut_q": ["dragon fruit pitaya cut open", "hylocereus undatus cross section"],
    },
    {
        "id": "pineapple",
        "whole": "v15-pineapple-whole.jpg",
        "cut": "v15-pineapple-cut.jpg",
        "must": re.compile(r"pineapple|ananas", re.I),
        "whole_q": ["whole pineapple fruit Ananas", "ripe pineapple standing"],
        "cut_q": ["pineapple fruit cut cross section", "ananas comosus sliced"],
    },
    {
        "id": "starfruit",
        "whole": "v15-starfruit-whole.jpg",
        "cut": "v15-starfruit-cut.jpg",
        "must": re.compile(r"starfruit|carambola|averrhoa", re.I),
        "whole_q": ["whole starfruit carambola", "Averrhoa carambola whole fruit"],
        "cut_q": ["starfruit carambola slices", "averrhoa carambola fruit slices"],
    },
]


def banned(blob: str) -> bool:
    return bool(BANNED.search(blob or ""))


def get(url: str, timeout: int = 45) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as resp:
        return resp.read()


def commons_search(query: str) -> list[dict]:
    qs = urllib.parse.urlencode(
        {
            "action": "query",
            "generator": "search",
            "gsrsearch": query,
            "gsrnamespace": "6",
            "gsrlimit": "12",
            "prop": "imageinfo",
            "iiprop": "url|size|mime",
            "iiurlwidth": "1920",
            "format": "json",
            "origin": "*",
        }
    )
    raw = get("https://commons.wikimedia.org/w/api.php?" + qs)
    data = json.loads(raw.decode("utf-8", "replace"))
    pages = (data.get("query") or {}).get("pages") or {}
    out = []
    for page in pages.values():
        title = page.get("title") or ""
        info = (page.get("imageinfo") or [{}])[0]
        url = info.get("thumburl") or info.get("url") or ""
        mime = info.get("mime") or ""
        if not url or not mime.startswith("image/"):
            continue
        out.append({"title": title, "url": url, "blob": f"{title} {url}"})
    return out


def curl_image(url: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".part")
    try:
        subprocess.check_call(
            ["curl", "-fsSL", "-L", "-A", UA, "--max-time", "60", "-o", str(tmp), url]
        )
    except subprocess.CalledProcessError:
        tmp.unlink(missing_ok=True)
        return False
    if not tmp.exists() or tmp.stat().st_size < 20000:
        tmp.unlink(missing_ok=True)
        return False
    tmp.replace(dest)
    return True


def to_void(src: Path, dest: Path) -> None:
    """Put the fruit on #08050e — the /api still-mask lesson (grey studio is fatal)."""
    tmp = dest.with_suffix(".void.jpg")
    vf = (
        "scale=1920:1080:force_original_aspect_ratio=decrease,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:0x08050e,"
        "eq=contrast=1.10:saturation=1.20:brightness=0.01,"
        "vignette=PI/4,format=yuv420p"
    )
    subprocess.check_call(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(src),
            "-vf",
            vf,
            "-frames:v",
            "1",
            "-q:v",
            "3",
            str(tmp),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if not tmp.exists() or tmp.stat().st_size < 20000:
        raise SystemExit(f"void grade empty for {dest.name}")
    tmp.replace(dest)


def fetch_kind(item: dict, kind: str) -> Path:
    dest = DEST_DIR / item[kind]
    raw = dest.with_suffix(".src.jpg")
    queries = item["whole_q" if kind == "whole" else "cut_q"]
    urls = []
    for q in queries:
        if banned(q):
            raise SystemExit(f"search leaked banned fruit: {q}")
        print(f"search commons {item['id']} {kind}: {q}", file=sys.stderr)
        try:
            hits = commons_search(q)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            print(f"commons search failed: {e}", file=sys.stderr)
            continue
        for hit in hits:
            if banned(hit["blob"]):
                continue
            if not item["must"].search(hit["blob"]):
                continue
            if hit["url"] not in urls:
                urls.append(hit["url"])
    if not urls:
        raise SystemExit(f"no {kind} still for {item['id']}")
    got = False
    for url in urls:
        print(f"fetch {item['id']} {kind} ← {url}", file=sys.stderr)
        if curl_image(url, raw):
            got = True
            break
    if not got:
        raise SystemExit(f"download empty {item['id']} {kind}")
    to_void(raw, dest)
    raw.unlink(missing_ok=True)
    print(f"void {dest.name} {dest.stat().st_size} bytes", file=sys.stderr)
    return dest


def main() -> None:
    DEST_DIR.mkdir(parents=True, exist_ok=True)
    print("=== v15 black-void stills (whole + cut, no grapes) ===", file=sys.stderr)
    for item in FRUIT:
        if banned(item["id"]):
            raise SystemExit("banned fruit in list")
        fetch_kind(item, "whole")
        fetch_kind(item, "cut")
    print("VOID READY mango,papaya,dragon,pineapple,starfruit (whole+cut, black)", file=sys.stderr)


if __name__ == "__main__":
    main()
