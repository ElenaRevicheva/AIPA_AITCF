#!/usr/bin/env python3
"""Point VJH CMO image URLs at the public CDN so Make.com/Buffer/Instagram can fetch them.

VibeJobHunterAIPA_AIMCF went private with the HUD listing. CMO still builds
imageURL from raw.githubusercontent.com/.../assets/.... The probe fails, the
payload sends imageURL="" (text-only fallback), Instagram 400s:
"Instagram is all about the images!".

Rewrite the assets prefix only. Secrets stay in .env.
"""
from __future__ import annotations

import ast
import sys
from pathlib import Path

OLD_ASSETS = (
    "https://raw.githubusercontent.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF/main/assets"
)
NEW_ASSETS = "https://webhook.aideazz.xyz/influencer-images/cmo"

# Repo-root raw URLs (sprinter.jpg lived here in older strings).
OLD_ROOT_SPRINTER = (
    "https://raw.githubusercontent.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF/main/sprinter.jpg"
)
NEW_SPRINTER = f"{NEW_ASSETS}/sprinter.jpg"

TARGETS = [
    "src/notifications/linkedin_cmo_v4.py",
    "scripts/patch_select_image.py",
    "scripts/fix_selected_image.py",
    "scripts/run_marketing_engine_four_image_test.py",
]


def patch_text(src: str) -> tuple[str, int]:
    n = src.count(OLD_ASSETS)
    out = src.replace(OLD_ASSETS, NEW_ASSETS)
    n += out.count(OLD_ROOT_SPRINTER)
    out = out.replace(OLD_ROOT_SPRINTER, NEW_SPRINTER)
    return out, n


def read_text(path: Path) -> str:
    """utf-8-sig strips a leading U+FEFF so Windows-saved helpers stay parseable."""
    return path.read_text(encoding="utf-8-sig")


def patch_file(path: Path) -> int:
    original = read_text(path)
    updated, n = patch_text(original)
    if n == 0:
        if NEW_ASSETS in original:
            print(f"already public: {path}")
            return 0
        print(f"no github-raw assets prefix: {path}")
        return 0
    if path.suffix == ".py":
        ast.parse(updated)
    bak = path.with_suffix(path.suffix + ".bak-pre-cmo-image-fix")
    if not bak.exists():
        bak.write_text(original, encoding="utf-8")
        print(f"backup {bak}")
    path.write_text(updated, encoding="utf-8")
    print(f"wrote {path} replacements={n}")
    return n


def remaining_github_raw(root: Path) -> list[str]:
    leftover: list[str] = []
    for rel in TARGETS:
        p = root / rel
        if not p.exists():
            continue
        text = read_text(p)
        if OLD_ASSETS in text or OLD_ROOT_SPRINTER in text:
            leftover.append(rel)
    return leftover


def _self_check() -> None:
    sample = f'github_base = "{OLD_ASSETS}"\nurl = "{OLD_ROOT_SPRINTER}"\n'
    out, n = patch_text(sample)
    assert NEW_ASSETS in out
    assert OLD_ASSETS not in out
    assert NEW_SPRINTER in out
    assert n >= 2
    bom_src = "\ufeff" + f'github_base = "{OLD_ASSETS}"\n'
    bom_out, bom_n = patch_text(bom_src.lstrip("\ufeff"))
    assert bom_n == 1
    ast.parse(bom_out)
    ast.parse("github_base = %r\n" % NEW_ASSETS)
    print("self-check ok")


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--self-check":
        _self_check()
        raise SystemExit(0)
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "/home/ubuntu/VibeJobHunterAIPA_AIMCF")
    total = 0
    errors = 0
    for rel in TARGETS:
        p = root / rel
        if not p.exists():
            print(f"skip missing {rel}")
            continue
        try:
            total += patch_file(p)
        except SyntaxError as exc:
            errors += 1
            print(f"WARN: skip {rel}: {exc}")
    if total == 0:
        print("nothing rewritten (already patched or prefixes gone)")
    else:
        print(f"total replacements={total}")
    leftover = remaining_github_raw(root)
    if leftover:
        print("FAIL: github-raw still in: " + ", ".join(leftover))
        raise SystemExit(1)
    if errors:
        print(f"FAIL: {errors} file(s) could not be parsed")
        raise SystemExit(1)
    print("all CMO targets: no github-raw assets prefix")
