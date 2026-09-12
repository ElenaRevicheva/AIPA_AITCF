#!/usr/bin/env python3
"""Download a juicy unused Pixabay bed for the /api YouTube film.

Follows docs/atuona/FILM_COMPILATION_GUIDE.md §4:
  Bright Data Web Unlocker → JSON-LD AudioObject.contentUrl → plain curl the CDN mp3.

Mood for THIS film (product promo, fruit + live /api walkthrough):
  want juicy / tropical / mango / summer / upbeat / latin-afro house — instrumental
  reject sad / meditative / dark / drone / dreamy / enigmatic / vocals
  reject every bed this promo or the poetry gallery already burned

Do NOT write into data/atuona/films/music/ — that library is first-alpha and
would leak a corporate bed into the poetry gallery.

v14 must fetch a NEW file. Cache hits on v13 dest names are refused.
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
SELECTED_CREDIT = DEST_DIR / "SELECTED.credit"

# Poetry gallery + every /api promo bed already published.
# v13 = Chill House by Kulakovka. v12 = Chillout Enigmatic / Oleg-Mazur.
# Tropical Cocktail, Distant Horizon, Morning Light are burned.
BURNED = re.compile(
    r"light.?in.?the.?void|fatal.?error|dark.?cinematic.?drone|"
    r"atmospheric.?dark|morning.?light|tropical.?cocktail|fresh.?tropical|"
    r"distant.?horizon|oleg.?mazur|chillout.?enigmatic|chillout.?lounge|"
    r"joyful.?chill|energetic.?chillout|feel.?good.?lounge|"
    r"organic.?house.?sunset|chill.?house.?sunset|kulakovka|"
    r"chill.?house(?!.{0,40}(tropical|mango|beach.?party|summer))",
    re.I,
)
REJECT_MOOD = re.compile(
    r"dark|drone|suspense|horror|trailer|epic|trap|phonk|restless|chasing|aggressive|"
    r"noisy|sad|melanchol|meditat|dreamy|enigmatic|vocal|lyrics|singing|choir|"
    + BURNED.pattern,
    re.I,
)
WANT_MOOD = re.compile(
    r"juicy|mango|papaya|citrus|passion.?fruit|tropical|summer|sunny|fruit|"
    r"upbeat|positive|latin.?house|afro.?house|bossa|feel.?good|groove|"
    r"beach.?party|moombahton|uplifting",
    re.I,
)

# Pinned track pages first (real 2026 Pixabay URLs). Search pages are fallbacks.
# Dest names are v14-* so a leftover joyful-chill-house-2026-pixabay.mp3 cannot win.
CANDIDATES = [
    {
        "page": "https://pixabay.com/music/soft-house-under-the-mango-sky-495373/",
        "dest": "v14-under-the-mango-sky-pixabay.mp3",
        "expect": "Under the Mango Sky",
        "search": False,
    },
    {
        "page": "https://pixabay.com/music/corporate-tropical-house-beach-party-energetic-summer-pop-479121/",
        "dest": "v14-tropical-house-beach-party-pixabay.mp3",
        "expect": "Tropical House Beach Party",
        "search": False,
    },
    {
        "page": "https://pixabay.com/music/soft-house-tropical-tropical-house-472097/",
        "dest": "v14-tropical-tropical-house-pixabay.mp3",
        "expect": "Tropical Tropical House",
        "search": False,
    },
    {
        "page": "https://pixabay.com/music/upbeat-tropical-510275/",
        "dest": "v14-upbeat-tropical-pixabay.mp3",
        "expect": "Upbeat Tropical",
        "search": False,
    },
    {
        "page": "https://pixabay.com/music/bossa-nova-upbeat-brazilian-tropical-background-music-477795/",
        "dest": "v14-upbeat-brazilian-tropical-pixabay.mp3",
        "expect": "Upbeat Brazilian Tropical",
        "search": False,
    },
    {
        "page": "https://pixabay.com/music/search/juicy%20tropical%20instrumental/",
        "dest": "v14-juicy-tropical-search-pixabay.mp3",
        "expect": "Juicy Tropical",
        "search": True,
    },
    {
        "page": "https://pixabay.com/music/search/mango%20papaya%20lounge/",
        "dest": "v14-mango-papaya-lounge-pixabay.mp3",
        "expect": "Mango Papaya",
        "search": True,
    },
]


def is_burned(blob: str) -> bool:
    return bool(BURNED.search(blob or ""))


def is_dreamy_or_vocal(blob: str) -> bool:
    return bool(re.search(r"dreamy|enigmatic|vocal|lyrics|singing|choir", blob or "", re.I))


def is_juicy_fresh(name: str, tags: str = "") -> bool:
    """True when a Pixabay title+tags are unused and juicy enough for v14."""
    blob = f"{name} {tags}"
    if is_burned(blob) or is_dreamy_or_vocal(blob):
        return False
    if REJECT_MOOD.search(blob) and not WANT_MOOD.search(blob):
        return False
    return bool(WANT_MOOD.search(blob))


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
        if is_burned(slug):
            continue
        score = sum(1 for t in tokens if t in slug)
        ranked.append((score, h))
    ranked.sort(reverse=True)
    if not ranked:
        return None
    best = ranked[0][1]
    if best.startswith("http"):
        return best
    return "https://pixabay.com" + best


def allow_cache() -> bool:
    return os.environ.get("API_FILM_ALLOW_MUSIC_CACHE", "").strip() == "1"


def main() -> int:
    token = read_env("BRIGHTDATA_API_TOKEN")
    zone = read_env("BRIGHTDATA_ZONE") or "web_unlocker1"
    print(f"BRIGHTDATA_API_TOKEN: {'yes' if token else 'NO'}")
    print(f"BRIGHTDATA_ZONE: {zone}")
    print("mood: juicy unused Pixabay (not Kulakovka Chill House, not Oleg-Mazur)")
    if not token:
        print("FATAL: Bright Data token missing — cannot unlock Pixabay pages")
        return 1

    DEST_DIR.mkdir(parents=True, exist_ok=True)
    chosen = None
    credit = ""
    for cand in CANDIDATES:
        dest = DEST_DIR / cand["dest"]
        print(f"\n--- candidate {cand['expect']}")
        print(f"page {cand['page']}")
        if dest.exists() and dest.stat().st_size > 50000 and allow_cache():
            print(f"cache hit {dest.name} {dest.stat().st_size} bytes")
            chosen = dest
            credit = cand["expect"]
            break
        if dest.exists() and not allow_cache():
            dest.unlink()
            print(f"deleted stale {dest.name} — v14 fetches fresh")
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
            m = re.search(r"https://cdn\.pixabay\.com/download/audio/[^\"'\s?]+\.mp3", html)
            if not m:
                print("no AudioObject contentUrl")
                continue
            content = m.group(0)
            audio = {"contentUrl": content, "name": cand["expect"]}
        content = str(audio.get("contentUrl"))
        summary = tags_of(html, audio)
        name = str(audio.get("name", cand["expect"]))
        print(f"name {name}")
        print(f"tags {summary or '(none parsed)'}")
        blob = (summary + " " + name + " " + cand["dest"]).lower()
        if not is_juicy_fresh(name, summary + " " + cand["dest"]):
            if is_burned(blob):
                print("reject: burned bed")
            elif is_dreamy_or_vocal(blob):
                print("reject: dreamy/enigmatic/vocals")
            else:
                print("reject: not juicy enough")
            continue
        try:
            curl_mp3(content, dest)
        except (subprocess.CalledProcessError, SystemExit) as e:
            print(f"cdn fail: {e}")
            continue
        print(f"saved {dest.name} {dest.stat().st_size} bytes")
        chosen = dest
        credit = name
        break

    if not chosen:
        print("FATAL: no juicy unused Pixabay candidate downloaded")
        return 1
    SELECTED.write_text(str(chosen) + "\n")
    SELECTED_CREDIT.write_text((credit or chosen.name) + " (Pixabay)\n")
    print(f"\nSELECTED {chosen}")
    print(f"CREDIT {credit}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
