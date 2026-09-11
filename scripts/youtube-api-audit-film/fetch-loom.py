#!/usr/bin/env python3
"""Download Elena's muted /api Loom walkthrough as mp4.

Public share: https://www.loom.com/share/f4a4a4cf12e34fb2b7984ab1663a2386
POST /api/campaigns/sessions/{id}/transcoded-url → signed CDN mp4.
This VM often cannot TLS to loom.com; the GitHub Actions runner and Oracle can.

Prefer raw-url (original capture). If that URL 200s a stub (we saw 230 bytes),
fall through to transcoded-url. A URL is not a file.
"""
from __future__ import annotations

import argparse
import json
import ssl
import subprocess
import sys
import urllib.request
from pathlib import Path

LOOM_ID = "f4a4a4cf12e34fb2b7984ab1663a2386"
TRANSCODE = f"https://www.loom.com/api/campaigns/sessions/{LOOM_ID}/transcoded-url"
RAW = f"https://www.loom.com/api/campaigns/sessions/{LOOM_ID}/raw-url"
MIN_BYTES = 200000


def post_url(endpoint: str) -> str:
    req = urllib.request.Request(
        endpoint,
        data=b"{}",
        method="POST",
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; aideazz-film/1.0)",
            "Accept": "application/json",
        },
    )
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=45, context=ctx) as resp:
        body = resp.read().decode("utf-8", "replace")
    data = json.loads(body)
    url = data.get("url") or data.get("cdnUrl") or ""
    if not url:
        raise RuntimeError("no url in " + body[:240])
    return url


def curl_to(url: str, tmp: Path) -> int:
    tmp.unlink(missing_ok=True)
    try:
        subprocess.check_call(
            [
                "curl",
                "-fsSL",
                "-L",
                "-A",
                "Mozilla/5.0",
                "--max-time",
                "180",
                "-o",
                str(tmp),
                url,
            ]
        )
    except subprocess.CalledProcessError as e:
        print(f"WARN loom curl rc={e.returncode}")
        tmp.unlink(missing_ok=True)
        return 0
    return tmp.stat().st_size if tmp.exists() else 0


def peek(tmp: Path) -> str:
    if not tmp.exists():
        return ""
    raw = tmp.read_bytes()[:180]
    return raw.decode("utf-8", "replace").replace("\n", " ")


def sources() -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for name, endpoint in (("raw-url", RAW), ("transcoded-url", TRANSCODE)):
        try:
            url = post_url(endpoint)
            print(f"loom {name} cdn url ok")
            out.append((name, url))
        except Exception as e:
            print(f"WARN loom {name}: {type(e).__name__}: {e}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    dest = Path(args.out)
    dest.parent.mkdir(parents=True, exist_ok=True)
    id_file = dest.with_suffix(".id")
    cached_id = id_file.read_text().strip() if id_file.exists() else ""
    if (
        not args.force
        and dest.exists()
        and dest.stat().st_size > MIN_BYTES
        and cached_id == LOOM_ID
    ):
        print(f"loom cache hit {dest} {dest.stat().st_size} bytes id={LOOM_ID}")
        return 0
    print(f"loom id {LOOM_ID}")
    tmp = dest.with_suffix(".part")
    for name, url in sources():
        print(f"loom downloading {name}")
        size = curl_to(url, tmp)
        if size >= MIN_BYTES:
            tmp.replace(dest)
            id_file.write_text(LOOM_ID + "\n")
            print(f"loom saved {dest} {size} bytes via {name}")
            return 0
        print(f"WARN {name} too small ({size}) peek={peek(tmp)!r}")
        tmp.unlink(missing_ok=True)
    print("FATAL loom: neither raw-url nor transcoded-url produced an mp4")
    return 1


if __name__ == "__main__":
    sys.exit(main())
