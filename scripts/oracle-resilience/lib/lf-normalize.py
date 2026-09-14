#!/usr/bin/env python3
"""Normalize text files to LF (no CR, no UTF-8 BOM).

Git stores LF. Oracle `scp` and Windows checkouts can write CRLF. md5 then
disagrees on identical classify.ts, and a later `git checkout` looks like it
"lost" the lexical fallback when it only stripped carriage returns.

Used on Oracle (sync-atlas-encoding.sh, push-atlas-patch.sh) and in AIPA tests.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

BOM = b"\xef\xbb\xbf"


def analyze(data):
    bom = data.startswith(BOM)
    body = data[len(BOM) :] if bom else data
    crlf = body.count(b"\r\n")
    lf = body.count(b"\n") - crlf
    lone_cr = body.count(b"\r") - crlf
    return {
        "bom": bom,
        "crlf": crlf,
        "lf": lf,
        "lone_cr": lone_cr,
        "bytes": len(data),
        "is_lf": (not bom) and crlf == 0 and lone_cr == 0,
    }


def normalize(data):
    if data.startswith(BOM):
        data = data[len(BOM) :]
    return data.replace(b"\r\n", b"\n").replace(b"\r", b"\n")


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("paths", nargs="+")
    p.add_argument("--strip", action="store_true", help="rewrite files to LF in place")
    p.add_argument("--check", action="store_true", help="exit 1 if any file is not LF")
    args = p.parse_args(argv)
    dirty = 0
    for raw in args.paths:
        path = Path(raw)
        if not path.is_file():
            print(f"MISSING {path}", file=sys.stderr)
            dirty += 1
            continue
        data = path.read_bytes()
        info = analyze(data)
        status = "LF" if info["is_lf"] else "NEEDS_NORM"
        print(
            f"{status} {path} bytes={info['bytes']} crlf={info['crlf']} "
            f"lf={info['lf']} lone_cr={info['lone_cr']} bom={int(info['bom'])}"
        )
        if args.strip and not info["is_lf"]:
            path.write_bytes(normalize(data))
            print(f"stripped {path}")
        if args.check and not info["is_lf"]:
            dirty += 1
    return 1 if dirty else 0


if __name__ == "__main__":
    sys.exit(main())
