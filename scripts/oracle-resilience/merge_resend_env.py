#!/usr/bin/env python3
"""Merge RESEND_API_KEY into ~/cto-aipa/.env. Optional second file: plain text for MARKETING_INQUIRY_FROM value."""
import pathlib
import sys

if len(sys.argv) < 2:
    print("Usage: merge_resend_env.py /path/to/keyfile [/path/to/from_text]", file=sys.stderr)
    sys.exit(1)

key_path = pathlib.Path(sys.argv[1])
env_path = pathlib.Path.home() / "cto-aipa" / ".env"
from_path = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else None

key = key_path.read_text(encoding="utf-8").strip()
if not key:
    print("Empty key file", file=sys.stderr)
    sys.exit(1)

optional_from = from_path.read_text(encoding="utf-8").strip() if from_path and from_path.is_file() else ""

text = env_path.read_text(encoding="utf-8")
lines = [
    l
    for l in text.splitlines()
    if not l.startswith("RESEND_API_KEY=")
    and not l.startswith("RESEND_KEY=")
    and not (optional_from and l.startswith("MARKETING_INQUIRY_FROM="))
]
lines.append("RESEND_API_KEY=" + key)
if optional_from:
    lines.append("MARKETING_INQUIRY_FROM=" + optional_from)

env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
key_path.unlink(missing_ok=True)
if from_path and from_path.is_file():
    from_path.unlink(missing_ok=True)
print("OK:", env_path)
