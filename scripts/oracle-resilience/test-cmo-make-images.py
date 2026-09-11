#!/usr/bin/env python3
"""Local checks for the VJH CMO public-image patcher."""
from __future__ import annotations

import importlib.util
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load():
    spec = importlib.util.spec_from_file_location(
        "patch_cmo_make_images",
        HERE / "patch-cmo-make-images.py",
    )
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    m = _load()
    m._self_check()

    raw = (
        "\ufeffimport sys, shutil, os\n"
        f'github_base = "{m.OLD_ASSETS}"\n'
        "print(github_base)\n"
    )
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        dest = root / "scripts"
        dest.mkdir()
        bom_file = dest / "patch_select_image.py"
        bom_file.write_bytes(raw.encode("utf-8"))  # keep the BOM on disk
        live = root / "src" / "notifications"
        live.mkdir(parents=True)
        (live / "linkedin_cmo_v4.py").write_text(
            f'CDN = "{m.NEW_ASSETS}"\n',
            encoding="utf-8",
        )
        n = m.patch_file(bom_file)
        assert n == 1, n
        text = bom_file.read_text(encoding="utf-8")
        assert not text.startswith("\ufeff"), "BOM should be stripped on write"
        assert m.OLD_ASSETS not in text
        assert m.NEW_ASSETS in text
        leftover = m.remaining_github_raw(root)
        assert leftover == [], leftover

    print("test-cmo-make-images: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
