#!/usr/bin/env python3
"""Download Elena's muted /api Loom walkthrough as mp4.

Public share: https://www.loom.com/share/8dfbc2ec71c343bd9b06a64949e61b68
POST /api/campaigns/sessions/{id}/transcoded-url → signed CDN mp4.
This VM often cannot TLS to loom.com; the GitHub Actions runner and Oracle can.
"""
from __future__ import annotations

import argparse
import json
import ssl
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

LOOM_ID = "8dfbc2ec71c343bd9b06a64949e61b68"
TRANSCODE = f"https://www.loom.com/api/campaigns/sessions/{LOOM_ID}/transcoded-url"


def transcoded_url() -> str:
    req = urllib.request.Request(
        TRANSCODE,
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
        raise SystemExit("Loom transcode JSON had no url: " + body[:240])
    return url


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    dest = Path(args.out)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 200000:
        print(f"loom cache hit {dest} {dest.stat().st_size} bytes")
        return 0
    print(f"loom id {LOOM_ID}")
    try:
        url = transcoded_url()
    except Exception as e:
        print(f"FATAL loom transcode: {type(e).__name__}: {e}")
        return 1
    print("loom cdn url ok")
    tmp = dest.with_suffix(".part")
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
        print(f"FATAL loom curl rc={e.returncode}")
        tmp.unlink(missing_ok=True)
        return 1
    size = tmp.stat().st_size if tmp.exists() else 0
    if size < 200000:
        print(f"FATAL loom mp4 too small ({size})")
        tmp.unlink(missing_ok=True)
        return 1
    tmp.replace(dest)
    print(f"loom saved {dest} {size} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
