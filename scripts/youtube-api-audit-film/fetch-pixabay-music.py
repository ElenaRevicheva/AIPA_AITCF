#!/usr/bin/env python3
"""Download a Pixabay bed for the /api YouTube film.

Follows docs/atuona/FILM_COMPILATION_GUIDE.md §4:
  Bright Data Web Unlocker → JSON-LD AudioObject.contentUrl → plain curl the CDN mp3.

Mood for THIS film (product promo, fruit + live /api walkthrough):
  want chillout energy / tropical / lounge / fresh / juicy — instrumental
  reject sad / meditative / dark / drone / vocals / Morning Light (already burned)

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

# Elena: Tropical Cocktail ≠ 2026 chillout; Distant Horizon was Dreamy and got burned.
# Prefer organic/sunset chill house published in 2026, instrumental, not sad.
CANDIDATES = [
    {
        "page": "https://pixabay.com/music/search/joyful%20chill%20house%202026/",
        "dest": "joyful-chill-house-2026-pixabay.mp3",
        "expect": "Joyful Chill",
        "search": True,
    },
    {
        "page": "https://pixabay.com/music/search/energetic%20chillout%202026/",
        "dest": "energetic-chillout-2026-pixabay.mp3",
        "expect": "Energetic",
        "search": True,
    },
    {
        "page": "https://pixabay.com/music/search/feel%20good%20lounge%202026/",
        "dest": "feel-good-lounge-2026-pixabay.mp3",
        "expect": "Feel Good",
        "search": True,
    },
    {
        "page": "https://pixabay.com/music/search/chillout%20lounge%202026/",
        "dest": "chillout-lounge-2026-pixabay.mp3",
        "expect": "Chillout",
        "search": True,
    },
    {
        "page": "https://pixabay.com/music/search/organic%20house%20sunset/",
        "dest": "organic-house-sunset-pixabay.mp3",
        "expect": "Organic House",
        "search": True,
    },
    {
        "page": "https://pixabay.com/music/search/chill%20house%20sunset%20groove/",
        "dest": "chill-house-sunset-groove-pixabay.mp3",
        "expect": "Sunset Groove",
        "search": True,
    },
    {
        "page": "https://pixabay.com/music/search/chill%20house%20deep%20house/",
        "dest": "chill-house-deep-house-pixabay.mp3",
        "expect": "Chill House",
        "search": True,
    },
]

REJECT_MOOD = re.compile(
    r"dark|drone|suspense|horror|trailer|epic|trap|phonk|restless|chasing|aggressive|"
    r"noisy|sad|melanchol|meditat|dreamy|enigmatic|vocal|lyrics|singing|choir|"
    r"morning.?light|tropical.?cocktail|distant.?horizon",
    re.I,
)
WANT_MOOD = re.compile(
    r"chill|house|lounge|organic|sunset|groove|deep.?house|joyful|feel.?good|energetic|upbeat|summer",
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


def resolve_track_page(html: str, expect: str) -> str | None:
    """Turn a Pixabay search page into a /music/<slug>/ URL."""
    hrefs = re.findall(r'href="(/music/[a-z0-9-]+-\d+/)"', html, re.I)
    if not hrefs:
        hrefs = re.findall(r'href="(https://(?:www\.)?pixabay\.com/music/[a-z0-9-]+-\d+/)"', html, re.I)
    tokens = [t for t in re.split(r"[^a-z0-9]+", expect.lower()) if len(t) > 3]
    ranked = []
    for h in hrefs:
        slug = h.lower()
        score = sum(1 for t in tokens if t in slug)
        ranked.append((score, h))
    ranked.sort(reverse=True)
    if not ranked:
        return None
    best = ranked[0][1]
    if best.startswith("http"):
        return best
    return "https://pixabay.com" + best


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
        if cand.get("search") or "/music/search/" in cand["page"]:
            track = resolve_track_page(html, cand["expect"])
            if not track:
                print("search page had no /music/ track link")
                continue
            print(f"search → {track}")
            try:
                html = unlock(track, token, zone)
            except Exception as e:
                print(f"track unlocker fail: {type(e).__name__}")
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
        if re.search(r"vocal|lyrics|singing|choir", blob):
            print("reject: has vocals")
            continue
        # Distant Horizon matched WANT (chill house) AND Dreamy — that exception burned.
        if re.search(r"dreamy|tropical.?cocktail|distant.?horizon|morning.?light", blob):
            print("reject: burned or dreamy")
            continue
        if REJECT_MOOD.search(blob) and not WANT_MOOD.search(blob):
            print("reject: mood tags are dark/sad/noisy")
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
