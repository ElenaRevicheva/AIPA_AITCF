#!/usr/bin/env python3
"""Merge RECAPTCHA_SECRET_KEY into ~/cto-aipa/.env from a one-line file; delete secret file after."""
import pathlib
import sys

if len(sys.argv) < 2:
    print("Usage: merge_recaptcha_secret.py /path/to/secretfile", file=sys.stderr)
    sys.exit(1)

key_path = pathlib.Path(sys.argv[1])
env_path = pathlib.Path.home() / "cto-aipa" / ".env"
secret = key_path.read_text(encoding="utf-8").strip()
if not secret:
    print("Empty secret file", file=sys.stderr)
    sys.exit(1)

lines = [
    l
    for l in env_path.read_text(encoding="utf-8").splitlines()
    if not l.startswith("RECAPTCHA_SECRET_KEY=")
]
lines.append("RECAPTCHA_SECRET_KEY=" + secret)
env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
key_path.unlink(missing_ok=True)
print("OK:", env_path)
