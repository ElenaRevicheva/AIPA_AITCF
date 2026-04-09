#!/usr/bin/env python3
"""One-shot: set MARKETING_INQUIRY_FROM + NOTIFY_TO for verified aideazz.xyz (run on Oracle)."""
import pathlib

p = pathlib.Path.home() / "cto-aipa" / ".env"
lines = [
    l
    for l in p.read_text(encoding="utf-8").splitlines()
    if not l.startswith("MARKETING_INQUIRY_FROM=")
    and not l.startswith("MARKETING_INQUIRY_NOTIFY_TO=")
]
lines.append("MARKETING_INQUIRY_FROM=AIdeazz <aipa@aideazz.xyz>")
lines.append("MARKETING_INQUIRY_NOTIFY_TO=aipa@aideazz.xyz")
p.write_text("\n".join(lines) + "\n", encoding="utf-8")
print("OK:", p)
