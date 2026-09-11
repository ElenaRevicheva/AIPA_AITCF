#!/usr/bin/env python3
"""Download a Pixabay bed for the /api YouTube film.

Follows docs/atuona/FILM_COMPILATION_GUIDE.md §4:
  Bright Data Web Unlocker → JSON-LD AudioObject.contentUrl → plain curl the CDN mp3.

Mood for THIS film (product promo, not Atuona poetry):
  want Light / Optimistic / Positive / Inspiring / Laid Back / Uplifting
  reject Dark / Drone / Suspense / Epic trailer / restless chasing EDM

Do NOT write into data/atuona/films/music/ — that library is first-alpha and
would leak a corporate bed into the poetry gallery.
"""
from __future__ import annotations

import json
import os
import re
import ssl
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ENV_FILE = os.environ.get("CTO_ENV", "/home/ubuntu/cto-aipa/.env")
DEST_DIR = Path(os.environ.get("API_FILM_MUSIC_DIR", "/home/ubuntu/aideazz-api-film/music"))
SELECTED = DEST_DIR / "SELECTED.path"

# Ordered by mood-tag fit. Tags from the Pixabay track pages (not auditioned).
# 1) Morning Light — Light, Optimistic, Positive, Laid Back, Dreamy, Bright, Hopeful, Elegant/Smooth
# 2) Happy Motivational — gentle guitar+piano, Bright, Clean, Optimistic (backup)
CANDIDATES = [
    {
        "page": "https://pixabay.com/music/corporate-morning-light-fresh-corporate-459811/",
        "dest": "morning-light-fresh-corporate-pixabay.mp3",
        "expect": "Morning Light",
    },
    {
        "page": "https://pixabay.com/music/corporate-happy-motivational-uplifting-corporate-148119/",
        "dest": "happy-motivational-uplifting-corporate-pixabay.mp3",
        "expect": "Happy Motivational",
    },
]

REJECT_MOOD = re.compile(
    r"dark|drone|suspense|horror|trailer|epic|trap|phonk|restless|chasing|aggressive|noisy",
    re.I,
)
WANT_MOOD = re.compile(
    r"light|optimistic|positive|inspiring|uplifting|hopeful|laid.?back|bright|gentle|fresh",
    re.I,
)


def read_env(name: str) -> str:
    try:
        text = Path(ENV_FILE).read_text()
    except FileNotFoundError:
        return ""
    for line in text.splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def unlock(url: str, token: str, zone: str) -> str:
    body = json.dumps({"zone": zone, "url": url, "format": "raw"}).encode()
    req = urllib.request.Request(
        "https://api.brightdata.com/request",
        data=body,
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=90, context=ctx) as resp:
        return resp.read().decode("utf-8", "replace")


def ld_blocks(html: str) -> list:
    out = []
    for m in re.finditer(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.I | re.S,
    ):
        raw = m.group(1).strip()
        try:
            out.append(json.loads(raw))
        except json.JSONDecodeError:
            continue
    return out


def walk(obj, acc):
    if isinstance(obj, dict):
        acc.append(obj)
        for v in obj.values():
            walk(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            walk(v, acc)


def audio_from_ld(blocks) -> dict | None:
    acc = []
    for b in blocks:
        walk(b, acc)
    best = None
    for d in acc:
        types = d.get("@type")
        types = types if isinstance(types, list) else [types]
        types = [str(t) for t in types if t]
        url = d.get("contentUrl") or d.get("url") or ""
        if not isinstance(url, str):
            continue
        path_only = url.split("?")[0].lower()
        if "cdn.pixabay.com/download/audio" in path_only or (
            "cdn.pixabay.com" in path_only and path_only.endswith(".mp3")
        ):
            best = d
            if any("AudioObject" in t for t in types):
                return d
    return best


def tags_of(html: str, audio: dict) -> str:
    bits = []
    for k in ("name", "description", "keywords", "genre"):
        v = audio.get(k)
        if isinstance(v, str) and v.strip():
            bits.append(v.strip()[:180])
        elif isinstance(v, list):
            bits.append(", ".join(str(x)[:40] for x in v[:12]))
    # Pixabay prints mood chips near "Mood"
    chip = re.search(r"Mood</[^>]+>\s*<[^>]+>(.*?)</", html, re.I | re.S)
    if chip:
        text = re.sub(r"<[^>]+>", " ", chip.group(1))
        text = re.sub(r"\s+", " ", text).strip()[:200]
        if text:
            bits.append("mood:" + text)
    return " | ".join(bits)[:400]


def curl_mp3(url: str, dest: Path) -> None:
    clean = url.split("?")[0]
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".part")
    subprocess.check_call(
        [
            "curl",
            "-fsSL",
            "-L",
            "-A",
            "Mozilla/5.0",
            "--max-time",
            "60",
            "-o",
            str(tmp),
            clean,
        ]
    )
    size = tmp.stat().st_size if tmp.exists() else 0
    if size < 50000:
        tmp.unlink(missing_ok=True)
        raise SystemExit(f"CDN mp3 too small ({size} bytes)")
    tmp.replace(dest)


def main() -> int:
    token = read_env("BRIGHTDATA_API_TOKEN")
    zone = read_env("BRIGHTDATA_ZONE") or "web_unlocker1"
    print(f"BRIGHTDATA_API_TOKEN: {'yes' if token else 'NO'}")
    print(f"BRIGHTDATA_ZONE: {zone}")
    if not token:
        print("FATAL: Bright Data token missing — cannot unlock Pixabay pages")
        return 1

    DEST_DIR.mkdir(parents=True, exist_ok=True)
    chosen = None
    for cand in CANDIDATES:
        dest = DEST_DIR / cand["dest"]
        print(f"\n--- candidate {cand['expect']}")
        print(f"page {cand['page']}")
        if dest.exists() and dest.stat().st_size > 50000:
            print(f"cache hit {dest.name} {dest.stat().st_size} bytes")
            chosen = dest
            break
        try:
            html = unlock(cand["page"], token, zone)
        except (urllib.error.URLError, TimeoutError, Exception) as e:
            print(f"unlocker fail: {type(e).__name__}")
            continue
        if "Just a moment" in html[:800] or "cf-browser-verification" in html:
            print("unlocker returned Cloudflare challenge — skip")
            continue
        audio = audio_from_ld(ld_blocks(html))
        if not audio or not audio.get("contentUrl"):
            # last-ditch: first cdn.pixabay.com/download/audio URL in the html
            m = re.search(r"https://cdn\.pixabay\.com/download/audio/[^\"'\s?]+\.mp3", html)
            if not m:
                print("no AudioObject contentUrl")
                continue
            content = m.group(0)
            audio = {"contentUrl": content, "name": cand["expect"]}
        content = str(audio.get("contentUrl"))
        summary = tags_of(html, audio)
        print(f"name {audio.get('name', '?')}")
        print(f"tags {summary or '(none parsed)'}")
        blob = (summary + " " + str(audio.get("name", ""))).lower()
        if REJECT_MOOD.search(blob) and not WANT_MOOD.search(blob):
            print("reject: mood tags are dark/noisy")
            continue
        try:
            curl_mp3(content, dest)
        except (subprocess.CalledProcessError, SystemExit) as e:
            print(f"cdn fail: {e}")
            continue
        print(f"saved {dest.name} {dest.stat().st_size} bytes")
        chosen = dest
        break

    if not chosen:
        print("FATAL: no Pixabay candidate downloaded")
        return 1
    SELECTED.write_text(str(chosen) + "\n")
    print(f"\nSELECTED {chosen}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
