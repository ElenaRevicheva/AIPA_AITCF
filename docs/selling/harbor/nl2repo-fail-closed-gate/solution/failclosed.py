#!/usr/bin/env python3
"""Fail-closed number gate. Golden implementation for the Harbor sample."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ALLOWLIST = Path("allowlist.txt")
NUMBER = re.compile(r"\d+")


def load_allowed() -> set[str] | None:
    if not ALLOWLIST.is_file():
        return None
    tokens: set[str] = set()
    for line in ALLOWLIST.read_text(encoding="utf-8").splitlines():
        token = line.strip()
        if token:
            tokens.add(token)
    return tokens


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        sys.stderr.write("usage: failclosed STATEMENT\n")
        return 1
    statement = argv[1]
    allowed = load_allowed()
    if allowed is None:
        sys.stderr.write("allowlist.txt missing\n")
        return 1
    numbers = NUMBER.findall(statement)
    missing = [n for n in numbers if n not in allowed]
    if missing:
        sys.stderr.write(f"unverified number: {missing[0]}\n")
        return 1
    sys.stdout.write(statement + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
