#!/usr/bin/env python3
"""Wire 2/3 GEO-API + 1/3 EspaLuz into EspaLuz_Influencer/main.py.

get_campaign_type_for_date becomes modulo-3. apply_lane swaps the image
to the new stills (10× weight) and maybe_geo_copy replaces Groq filler
when the URL is a geo-api asset. Existing me_*.jpg lists are not deleted.
Make.com still sees campaign_type marketing_engine on GEO days so the
existing Buffer router keeps working.
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

# Same directory as this patcher on Oracle (/tmp) and in the AIPA checkout.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from geo_api_promo import GEO_PRIMARY  # noqa: E402

IMPORT = "from geo_api_promo import apply_lane, maybe_geo_copy, canonicalize_aideazz_urls\n"

NEW_CAMPAIGN_FN = '''def get_campaign_type_for_date(dt: datetime) -> str:
    """2/3 GEO/AEO/Tech SEO (marketing_engine payload) · 1/3 EspaLuz.

    Panama calendar ordinal % 3: 0 and 1 → marketing_engine (GEO copy+images
    applied at send time), 2 → espaluz. Replaces odd/even 50/50.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    try:
        day = dt.astimezone(PANAMA_TZ).date()
    except Exception:
        day = dt.date()
    return "espaluz" if day.toordinal() % 3 == 2 else "marketing_engine"

'''

BEFORE_SEND = (
    "        campaign_type, image_url = apply_lane(campaign_type, image_url)\n"
    "        promo = maybe_geo_copy(campaign_type, image_url, promo)\n"
)
LOCAL_EXTRA = '        os.path.join(here, "geo_api_images", base),\n'


def _replace_function(src: str, name: str, new_fn: str) -> str:
    pattern = rf"(^(?:async )?def {re.escape(name)}\(.*?(?=^(?:async )?def |\Z))"
    m = re.search(pattern, src, flags=re.M | re.S)
    if not m:
        raise SystemExit(f"function {name} not found")
    replacement = new_fn if new_fn.endswith("\n") else new_fn + "\n"
    if not replacement.endswith("\n\n"):
        replacement = replacement.rstrip() + "\n\n"
    return src[: m.start()] + replacement + src[m.end() :]


def _inject_import(src: str) -> str:
    src = src.replace(
        "from geo_api_promo import apply_lane, maybe_geo_copy\n",
        IMPORT,
    )
    if "canonicalize_aideazz_urls" in src and "from geo_api_promo import" in src:
        return src
    if "from geo_api_promo import" in src:
        return src
    lines = src.splitlines(keepends=True)
    insert_at = 0
    for i, line in enumerate(lines[:80]):
        if line.startswith("import ") or line.startswith("from "):
            insert_at = i + 1
    lines.insert(insert_at, IMPORT)
    return "".join(lines)


def _ensure_canonicalize(src: str) -> str:
    if src.count("canonicalize_aideazz_urls(promo)") >= 2:
        return src
    out = []
    for line in src.splitlines(keepends=True):
        out.append(line)
        if re.match(r"[ \t]*promo = maybe_geo_copy\(", line) and "canonicalize_aideazz_urls" not in "".join(out[-3:]):
            indent = re.match(r"[ \t]*", line).group(0)
            nxt = f"{indent}promo = canonicalize_aideazz_urls(promo)\n"
            if nxt not in out[-1:]:
                out.append(nxt)
    return "".join(out)


def _inject_before_channel_send(src: str, fn: str) -> str:
    pattern = rf"(^(?:async )?def {re.escape(fn)}\(.*?(?=^(?:async )?def |\Z))"
    m = re.search(pattern, src, flags=re.M | re.S)
    if not m:
        raise SystemExit(f"function {fn} not found")
    body = m.group(0)
    if "apply_lane(campaign_type, image_url)" in body:
        print(f"{fn}: apply_lane already present")
        return src
    needle = "send_channel_promo_with_image(promo, image_url)"
    idx = body.find(needle)
    if idx < 0:
        raise SystemExit(f"{fn}: send_channel_promo_with_image(promo, image_url) not found")
    # match indentation of that call
    line_start = body.rfind("\n", 0, idx) + 1
    indent = re.match(r"[ \t]*", body[line_start:]).group(0)
    snippet = (
        f"{indent}campaign_type, image_url = apply_lane(campaign_type, image_url)\n"
        f"{indent}promo = maybe_geo_copy(campaign_type, image_url, promo)\n"
        f"{indent}promo = canonicalize_aideazz_urls(promo)\n"
    )
    body2 = body[:line_start] + snippet + body[line_start:]
    return src[: m.start()] + body2 + src[m.end() :]


def _ensure_local_search(src: str) -> str:
    if "geo_api_images" in src:
        return src
    needle = '        os.path.join(here, "assets", base),\n'
    if needle in src:
        return src.replace(needle, needle + LOCAL_EXTRA, 1)
    needle2 = '        os.path.join(here, "marketing_engine_images", base),\n'
    if needle2 in src:
        return src.replace(needle2, needle2 + LOCAL_EXTRA, 1)
    return src


def _prepend_geo_images(src: str) -> str:
    """Put the six new stills at the front of marketing_engine_image_urls.

    Does not delete me_*.jpg entries. apply_lane still uses the weighted pool
    so the new cards fire ~10× any single legacy file on GEO days.
    """
    if "geo-grapes-citation.jpg" in src:
        print("marketing_engine_image_urls already lists geo stills")
        return src
    m = re.search(r"marketing_engine_image_urls\s*=\s*\[", src)
    if not m:
        print("WARN: marketing_engine_image_urls list not found — skip prepend")
        return src
    block = "\n" + "\n".join(f'    "{u}",' for u in GEO_PRIMARY) + "\n"
    return src[: m.end()] + block + src[m.end() :]


def _retitle_schedule_copy(src: str) -> str:
    src = src.replace("odd=EspaLuz, even=Engine", "2/3 GEO-API, 1/3 EspaLuz")
    src = src.replace(
        "on **odd** calendar days we run classic EspaLuz tutoring stories; on **even** days we spotlight the **AI Marketing Engine**",
        "on **two of every three** calendar days we spotlight GEO/AEO/Tech-SEO (aideazz.xyz/api); the remaining day we run classic EspaLuz tutoring stories",
    )
    return src


def patch_source(src: str) -> str:
    src = _inject_import(src)
    src = _replace_function(src, "get_campaign_type_for_date", NEW_CAMPAIGN_FN)
    src = _inject_before_channel_send(src, "send_automated_daily_promo")
    src = _inject_before_channel_send(src, "send_daily_promo")
    src = _ensure_local_search(src)
    src = _prepend_geo_images(src)
    src = _retitle_schedule_copy(src)
    src = _ensure_canonicalize(src)
    return src


def patch_file(path: Path) -> None:
    original = path.read_text(encoding="utf-8")
    updated = patch_source(original)
    ast.parse(updated)
    if original == updated:
        print("main.py already geo-patched")
        return
    # Keep the backup out of EspaLuz_Influencer (HUD-listed). No secrets copied here.
    bak = Path("/tmp/EspaLuz_Influencer-main.py.bak-pre-geo-lane")
    if not bak.exists():
        bak.write_text(original, encoding="utf-8")
        print(f"backup {bak}")
    path.write_text(updated, encoding="utf-8")
    print(f"wrote {path} bytes={len(updated)}")


def _self_check() -> None:
    sample = (
        "import os\nfrom datetime import datetime, timezone\nPANAMA_TZ = timezone.utc\n"
        "def get_campaign_type_for_date(dt: datetime) -> str:\n"
        "    return 'espaluz' if dt.day % 2 else 'marketing_engine'\n\n"
        "def send_automated_daily_promo():\n"
        "    promo, story, video_url, image_url, campaign_type = generate_scheduled_promo_bundle()\n"
        "    try:\n"
        "        send_channel_promo_with_image(promo, image_url)\n"
        "        print('ok')\n"
        "    except Exception as e:\n"
        "        print(e)\n\n"
        "def send_daily_promo(message):\n"
        "    promo, story, video_url, image_url, campaign_type = generate_scheduled_promo_bundle()\n"
        "    try:\n"
        "        send_channel_promo_with_image(promo, image_url)\n"
        "        print('ok')\n"
        "    except Exception as e:\n"
        "        print(e)\n\n"
        "marketing_engine_image_urls = [\n"
        "    'https://webhook.aideazz.xyz/influencer-images/marketing_engine_images/me_01.jpg',\n"
        "]\n\n"
        "def next_fn():\n"
        "    return 1\n"
    )
    out = patch_source(sample)
    ast.parse(out)
    assert "from geo_api_promo import apply_lane" in out
    assert "day.toordinal() % 3" in out
    assert out.count("apply_lane(campaign_type, image_url)") == 2
    assert out.count("promo = maybe_geo_copy") == 2
    assert out.count("canonicalize_aideazz_urls(promo)") == 2
    assert "geo-grapes-citation.jpg" in out
    assert out.index("geo-grapes-citation.jpg") < out.index("me_01.jpg")
    assert "2/3 GEO-API" in out or "day.toordinal() % 3" in out
    print("self-check ok")


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--self-check":
        _self_check()
        raise SystemExit(0)
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "/home/ubuntu/EspaLuz_Influencer/main.py")
    patch_file(target)
