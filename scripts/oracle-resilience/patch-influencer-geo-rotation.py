#!/usr/bin/env python3
"""Wire 2/3 GEO-API + 1/3 EspaLuz into EspaLuz_Influencer/main.py.

Does not delete existing image lists. apply_lane() overrides the day's pick.
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

IMPORT = "from geo_api_promo import apply_lane, maybe_geo_copy\n"
APPLY = (
    "    campaign_type, image_url = apply_lane(campaign_type, image_url)\n"
)
COPY = (
    "    promo = maybe_geo_copy(campaign_type, image_url, promo)\n"
)
LOCAL_EXTRA = '        os.path.join(here, "geo_api_images", base),\n'


def _inject_import(src: str) -> str:
    if "from geo_api_promo import" in src:
        return src
    m = re.search(r"^(from geo_api_promo import[^\n]*\n)", src, re.M)
    if m:
        return src
    # after the last stdlib/third-party import block at top
    lines = src.splitlines(keepends=True)
    insert_at = 0
    for i, line in enumerate(lines[:80]):
        if line.startswith("import ") or line.startswith("from "):
            insert_at = i + 1
    lines.insert(insert_at, IMPORT)
    return "".join(lines)


def _inject_after_assignment(src: str, fn: str, var: str, snippet: str) -> str:
    if snippet.strip() in src and src.count(snippet.strip()) >= 1:
        # already in this file; still ensure inside this function
        pass
    pattern = rf"(^def {re.escape(fn)}\(.*?(?=^def |\Z))"
    m = re.search(pattern, src, flags=re.M | re.S)
    if not m:
        raise SystemExit(f"function {fn} not found")
    body = m.group(0)
    if snippet.strip() in body:
        print(f"{fn}: {snippet.strip()[:40]} already present")
        return src
    # last assignment to var in this function
    assigns = list(re.finditer(rf"^    {re.escape(var)} = .+$", body, re.M))
    if not assigns:
        raise SystemExit(f"{fn}: no '{var} =' assignment to hook")
    last = assigns[-1]
    body2 = body[: last.end()] + "\n" + snippet + body[last.end() :]
    return src[: m.start()] + body2 + src[m.end() :]


def _ensure_local_search(src: str) -> str:
    if 'geo_api_images' in src:
        return src
    needle = '        os.path.join(here, "assets", base),\n'
    if needle in src:
        return src.replace(needle, needle + LOCAL_EXTRA, 1)
    return src


def patch_source(src: str) -> str:
    src = _inject_import(src)
    src = _inject_after_assignment(src, "send_automated_daily_promo", "image_url", APPLY)
    src = _inject_after_assignment(src, "send_daily_promo", "image_url", APPLY)
    src = _inject_after_assignment(src, "send_automated_daily_promo", "promo", COPY)
    src = _inject_after_assignment(src, "send_daily_promo", "promo", COPY)
    src = _ensure_local_search(src)
    return src


def patch_file(path: Path) -> None:
    original = path.read_text(encoding="utf-8")
    updated = patch_source(original)
    ast.parse(updated)
    if original == updated:
        print("main.py already geo-patched")
        return
    bak = path.with_suffix(".py.bak-pre-geo-lane")
    if not bak.exists():
        bak.write_text(original, encoding="utf-8")
        print(f"backup {bak}")
    path.write_text(updated, encoding="utf-8")
    print(f"wrote {path} bytes={len(updated)}")


def _self_check() -> None:
    sample = (
        "import os\nfrom typing import Optional\n"
        "def send_automated_daily_promo():\n"
        "    campaign_type = 'x'\n"
        "    image_url = 'u'\n"
        "    promo = 'p'\n"
        "    requests.post(MAKE_WEBHOOK_URL, json=payload, timeout=20)\n\n"
        "def send_daily_promo(message):\n"
        "    campaign_type = 'x'\n"
        "    image_url = 'u'\n"
        "    promo = 'p'\n"
        "    requests.post(MAKE_WEBHOOK_URL, json=payload, timeout=20)\n\n"
        "def next_fn():\n"
        "    return 1\n"
    )
    out = patch_source(sample)
    ast.parse(out)
    assert "from geo_api_promo import apply_lane" in out
    assert out.count("apply_lane(campaign_type, image_url)") == 2
    assert out.count("promo = maybe_geo_copy") == 2
    print("self-check ok")


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--self-check":
        _self_check()
        raise SystemExit(0)
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "/home/ubuntu/EspaLuz_Influencer/main.py")
    patch_file(target)
