#!/usr/bin/env python3
"""Patch EspaLuz_Influencer/main.py so Make.com + Buffer can fetch promo images.

The GitHub repo went private (PII cleanup, 6 Sep 2026). Every
raw.githubusercontent.com URL now 404s. Telegram send_photo throws, and that
exception sits ABOVE the Make.com POST, so Buffer never sees the payload.

This rewrite:
  1. Points image URLs at https://webhook.aideazz.xyz/influencer-images/...
  2. Resolves me_*.jpg from marketing_engine_images/ on disk (Telegram upload).
  3. Lets a Telegram photo failure log, not abort the Make.com webhook.
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

PUBLIC_PREFIX = "https://webhook.aideazz.xyz/influencer-images/"
GITHUB_RAW = "https://raw.githubusercontent.com/ElenaRevicheva/EspaLuz_Influencer/main/"
GITHUB_RAW_ALT = "https://github.com/ElenaRevicheva/EspaLuz_Influencer/raw/main/"

NEW_LOCAL_FN = '''def _local_repo_image_path(image_url: str) -> Optional[str]:
    """Resolve a promo image to a file on disk.

    GitHub raw URLs 404 now that this repo is private. Telegram can upload a
    local file; Buffer/Make still need a public HTTP URL (see PUBLIC prefix).
    """
    if not image_url:
        return None
    base = image_url.rstrip("/").rsplit("/", 1)[-1]
    if not base or "/" in base or ".." in base:
        return None
    here = os.path.dirname(os.path.abspath(__file__))
    for candidate in (
        os.path.join(here, base),
        os.path.join(here, "marketing_engine_images", base),
        os.path.join(here, "assets", base),
    ):
        if os.path.isfile(candidate):
            return candidate
    return None
'''


def _replace_function(src: str, name: str, new_fn: str) -> str:
    pattern = rf"(^def {re.escape(name)}\(.*?(?=^def |\Z))"
    m = re.search(pattern, src, flags=re.M | re.S)
    if not m:
        raise SystemExit(f"function {name} not found")
    replacement = new_fn if new_fn.endswith("\n") else new_fn + "\n"
    if not replacement.endswith("\n\n"):
        replacement = replacement.rstrip() + "\n\n"
    return src[: m.start()] + replacement + src[m.end() :]


def _ensure_telegram_does_not_block_make(src: str) -> str:
    old_manual = (
        "    bot.reply_to(message, promo)\n"
        "    send_channel_promo_with_image(promo, image_url)\n"
        '    print(f"✅ Manual promo sent ({campaign_type}, photo+caption).")\n'
    )
    new_manual = (
        "    bot.reply_to(message, promo)\n"
        "    try:\n"
        "        send_channel_promo_with_image(promo, image_url)\n"
        '        print(f"✅ Manual promo sent ({campaign_type}, photo+caption).")\n'
        "    except Exception as _tg_err:\n"
        '        print(f"⚠️ Telegram photo failed (non-fatal, Make webhook still fires): {_tg_err}")\n'
    )
    if old_manual not in src:
        if "Telegram photo failed (non-fatal" in src:
            print("manual telegram wrap already present")
        else:
            raise SystemExit("send_daily_promo photo block not found (refusing to guess)")
    else:
        src = src.replace(old_manual, new_manual, 1)

    old_auto = (
        "        send_channel_promo_with_image(promo, image_url)\n"
        '        print(f"✅ Automated promo sent to @EspaLuz channel ({campaign_type}, photo+caption).")\n'
    )
    new_auto = (
        "        try:\n"
        "            send_channel_promo_with_image(promo, image_url)\n"
        '            print(f"✅ Automated promo sent to @EspaLuz channel ({campaign_type}, photo+caption).")\n'
        "        except Exception as _tg_err:\n"
        '            print(f"⚠️ Telegram photo failed (non-fatal, Make webhook still fires): {_tg_err}")\n'
    )
    if old_auto not in src:
        if src.count("Telegram photo failed (non-fatal") >= 2:
            print("automated telegram wrap already present")
        else:
            raise SystemExit("send_automated_daily_promo photo block not found")
    else:
        src = src.replace(old_auto, new_auto, 1)
    return src


def patch_source(src: str) -> str:
    if GITHUB_RAW in src:
        src = src.replace(GITHUB_RAW, PUBLIC_PREFIX)
        print(f"rewrote GitHub raw prefix → {PUBLIC_PREFIX}")
    elif PUBLIC_PREFIX in src:
        print("public image prefix already present")
    else:
        raise SystemExit("neither GitHub raw nor public image prefix found in main.py")
    if GITHUB_RAW_ALT in src:
        src = src.replace(GITHUB_RAW_ALT, PUBLIC_PREFIX)
        print("rewrote github.com/raw prefix")

    src = _replace_function(src, "_local_repo_image_path", NEW_LOCAL_FN)
    src = _ensure_telegram_does_not_block_make(src)

    src = src.replace(
        "response = requests.post(MAKE_WEBHOOK_URL, json=payload)",
        "response = requests.post(MAKE_WEBHOOK_URL, json=payload, timeout=20)",
    )
    return src


def patch_file(path: Path) -> None:
    original = path.read_text(encoding="utf-8")
    updated = patch_source(original)
    ast.parse(updated)
    if original == updated:
        print("main.py already patched")
        return
    bak = path.with_suffix(".py.bak-pre-make-image-fix")
    if not bak.exists():
        bak.write_text(original, encoding="utf-8")
        print(f"backup {bak}")
    path.write_text(updated, encoding="utf-8")
    print(f"wrote {path} bytes={len(updated)}")


def _self_check() -> None:
    sample = (
        "import os\nfrom typing import Optional\nMAKE_WEBHOOK_URL = 'x'\n"
        f'URL = "{GITHUB_RAW}marketing_engine_images/me_29.jpg"\n'
        "def _local_repo_image_path(image_url: str) -> Optional[str]:\n"
        "    base = image_url.rsplit('/', 1)[-1]\n"
        "    return base\n\n"
        "def send_automated_daily_promo():\n"
        "    try:\n"
        "        send_channel_promo_with_image(promo, image_url)\n"
        '        print(f"✅ Automated promo sent to @EspaLuz channel ({campaign_type}, photo+caption).")\n'
        "        payload = build_make_webhook_payload()\n"
        "        response = requests.post(MAKE_WEBHOOK_URL, json=payload)\n"
        "    except Exception as e:\n"
        "        print(e)\n\n"
        "def send_daily_promo(message):\n"
        "    bot.reply_to(message, promo)\n"
        "    send_channel_promo_with_image(promo, image_url)\n"
        '    print(f"✅ Manual promo sent ({campaign_type}, photo+caption).")\n'
        "    try:\n"
        "        payload = build_make_webhook_payload()\n"
        "        response = requests.post(MAKE_WEBHOOK_URL, json=payload)\n"
        "    except Exception as e:\n"
        "        print(e)\n\n"
        "def next_fn():\n"
        "    return 1\n"
    )
    out = patch_source(sample)
    ast.parse(out)
    assert PUBLIC_PREFIX in out
    assert GITHUB_RAW not in out
    assert "marketing_engine_images" in out
    assert "Make webhook still fires" in out
    assert "timeout=20" in out
    print("self-check ok")


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--self-check":
        _self_check()
        raise SystemExit(0)
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "/home/ubuntu/EspaLuz_Influencer/main.py")
    patch_file(target)
