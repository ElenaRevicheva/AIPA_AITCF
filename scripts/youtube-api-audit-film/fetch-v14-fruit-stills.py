#!/usr/bin/env python3
"""Fetch CUT tropical-fruit stills for the v14 middle.

Flux 2 Pro on Replicate returned HTTP 402 (no credit). Grapes stayed because
the painter never wrote new files. This fetcher is the replacement stills
path: Wikimedia Commons photos of mango / papaya / dragon fruit / pineapple /
starfruit, already cut open. No grapes. No pomegranate. No passionfruit.

Runs on Oracle (or any host that can reach commons.wikimedia.org).
Writes fruit/v14-*.jpg next to this script, then ffmpeg-grades them 1920x1080.
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
UA = "AIdeazzApiFilmV14/1.0 (https://aideazz.xyz/portfolio; aipa@aideazz.xyz)"
BANNED = re.compile(r"grape|pomegranate|passionfruit|maracuya|vine|raisin", re.I)
CTX = ssl.create_default_context()

# id must match fruit-v14-spec.cjs. Queries are Commons file-namespace searches.
FRUIT = [
    {
        "id": "mango",
        "dest": "v14-mango.jpg",
        "must": re.compile(r"mango", re.I),
        "queries": [
            "mango fruit cut open cross section",
            "sliced ripe mango golden flesh",
            "Mangifera indica cross section",
        ],
        "pins": [
            "https://commons.wikimedia.org/wiki/Special:FilePath/Mangoes%20-%20single%20and%20halved.jpg",
            "https://commons.wikimedia.org/wiki/Special:FilePath/Ataulfo%20mango%20cut.jpg",
        ],
    },
    {
        "id": "papaya",
        "dest": "v14-papaya.jpg",
        "must": re.compile(r"papaya|carica", re.I),
        "queries": [
            "papaya fruit cut in half black seeds",
            "papaya cross section coral flesh",
            "Carica papaya cross section",
        ],
        "pins": [
            "https://commons.wikimedia.org/wiki/Special:FilePath/Papaya%20cross%20section%20BNC.jpg",
            "https://commons.wikimedia.org/wiki/Special:FilePath/Carica%20papaya%20-%20Papaya%20fruits%20cross-section.jpg",
        ],
    },
    {
        "id": "dragon",
        "dest": "v14-dragonfruit.jpg",
        "must": re.compile(r"dragon|pitaya|hylocereus|pitahaya", re.I),
        "queries": [
            "dragon fruit pitaya cut open white flesh",
            "hylocereus undatus cross section",
            "pitaya fruit cut",
        ],
        "pins": [
            "https://commons.wikimedia.org/wiki/Special:FilePath/Pitaya%20cross%20section%20ed2.jpg",
            "https://commons.wikimedia.org/wiki/Special:FilePath/Hylocereus%20undatus%20red%20pitaya.jpg",
        ],
    },
    {
        "id": "pineapple",
        "dest": "v14-pineapple.jpg",
        "must": re.compile(r"pineapple|ananas", re.I),
        "queries": [
            "pineapple fruit cut cross section rings",
            "ananas comosus sliced juicy",
            "pineapple and cross section",
        ],
        "pins": [
            "https://commons.wikimedia.org/wiki/Special:FilePath/Pineapple%20and%20cross%20section.jpg",
            "https://commons.wikimedia.org/wiki/Special:FilePath/Ananas%20comosus%20cross%20section.jpg",
        ],
    },
    {
        "id": "starfruit",
        "dest": "v14-starfruit.jpg",
        "must": re.compile(r"starfruit|carambola|averrhoa", re.I),
        "queries": [
            "starfruit carambola slices cut",
            "averrhoa carambola fruit slices",
            "star fruit slices",
        ],
        "pins": [
            "https://commons.wikimedia.org/wiki/Special:FilePath/Averrhoa%20carambola%20slices.jpg",
            "https://commons.wikimedia.org/wiki/Special:FilePath/Carambola%20starfruit.jpg",
        ],
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
        blob = f"{title} {url}"
        out.append({"title": title, "url": url, "mime": mime, "blob": blob})
    return out


def curl_image(url: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".part")
    try:
        subprocess.check_call(
            [
                "curl",
                "-fsSL",
                "-L",
                "-A",
                UA,
                "--max-time",
                "60",
                "-o",
                str(tmp),
                url,
            ]
        )
    except subprocess.CalledProcessError:
        tmp.unlink(missing_ok=True)
        return False
    size = tmp.stat().st_size if tmp.exists() else 0
    if size < 20000:
        tmp.unlink(missing_ok=True)
        return False
    tmp.replace(dest)
    return True


def grade(src: Path, dest: Path) -> None:
    """Dark wet prestige grade, 1920x1080. Fruit stays the subject."""
    vf = (
        "scale=1920:1080:force_original_aspect_ratio=increase,"
        "crop=1920:1080,"
        "eq=contrast=1.12:saturation=1.28:brightness=0.02,"
        "vignette=PI/5,"
        "format=yuv420p"
    )
    tmp = dest.with_suffix(".graded.jpg")
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
        raise SystemExit(f"ffmpeg grade empty for {dest.name}")
    tmp.replace(dest)


def candidates(item: dict) -> list[str]:
    if banned(item["id"] + item["dest"]):
        raise SystemExit(f"v14 spec leaked a banned fruit: {item['id']}")
    urls: list[str] = []
    for pin in item.get("pins") or []:
        if not banned(pin):
            urls.append(pin)
    for q in item["queries"]:
        if banned(q):
            raise SystemExit(f"search leaked a banned fruit: {q}")
        print(f"search commons {item['id']}: {q}", file=sys.stderr)
        try:
            hits = commons_search(q)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            print(f"commons search failed {item['id']}: {e}", file=sys.stderr)
            continue
        for hit in hits:
            if banned(hit["blob"]):
                print(f"skip banned {hit['title']}", file=sys.stderr)
                continue
            if not item["must"].search(hit["blob"]):
                continue
            if hit["url"] not in urls:
                urls.append(hit["url"])
    return urls


def fetch_one(item: dict) -> Path:
    dest = DEST_DIR / item["dest"]
    raw = dest.with_suffix(".src.jpg")
    urls = candidates(item)
    if not urls:
        raise SystemExit(f"no cut-fruit still for {item['id']} — refusing grapes")
    got = False
    for url in urls:
        if banned(url):
            continue
        print(f"fetch {item['id']} ← {url}", file=sys.stderr)
        if curl_image(url, raw):
            got = True
            break
    if not got:
        raise SystemExit(f"download empty for {item['id']}")
    if shutil_which("ffmpeg"):
        grade(raw, dest)
        raw.unlink(missing_ok=True)
    else:
        raw.replace(dest)
    print(f"still {dest.name} {dest.stat().st_size} bytes", file=sys.stderr)
    return dest


def shutil_which(name: str) -> bool:
    from shutil import which

    return which(name) is not None


def main() -> None:
    DEST_DIR.mkdir(parents=True, exist_ok=True)
    print("=== v14 cut-fruit stills (no grapes) ===", file=sys.stderr)
    written = []
    for item in FRUIT:
        if banned(item["id"] + item["dest"]):
            raise SystemExit("banned fruit in FRUIT list")
        written.append(fetch_one(item))
    missing = [i["dest"] for i in FRUIT if not (DEST_DIR / i["dest"]).exists()]
    if missing:
        raise SystemExit("missing stills: " + ", ".join(missing))
    print(f"FETCHED {len(written)} new v14 fruit stills (no grapes)", file=sys.stderr)


if __name__ == "__main__":
    main()
