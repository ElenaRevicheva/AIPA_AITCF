"""Reject narrative that invents or recomputes figures.

The model is allowed to use only numbers that already appear in the decision
payload (including pre-formatted display strings). Arithmetic that happens to
be correct — e.g. cover − target = 2.55 — is still a violation, because the
brief forbids the model from doing maths. That is why months_over_target is
pre-baked into the payload: if the model needs it, it reads it; it must not
derive it.
"""

from __future__ import annotations

import json
import re
from typing import Iterable, List, Set, Tuple

# Match currency, bare decimals, percentages, and month-like quantities.
_NUMBER_RE = re.compile(
    r"""
    (?<![A-Za-z])                          # not inside a word (MGO 514+)
    (?:\$\s*)?                             # optional dollars
    (?P<num>\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+\.\d+|\d+)
    (?P<suf>\s*%|\s*pp)?                   # optional percent / pp
    (?![A-Za-z])
    """,
    re.VERBOSE,
)

# Numbers that are structural / rhetorical and never come from the extract.
_ALLOWLIST = {
    "1",
    "2",
    "3",
    "4",
    "5",  # five-minute read, top-N
    "30",  # phase-out floor days (stated in rules)
    "2026",
    "100",  # MGO grades appear in SKU names; also "100%"
    "250",
    "500",
    "850",
    "1700",
    "263",
    "514",
}


def _normalize(token: str) -> str:
    return token.replace(",", "").replace("$", "").replace(" ", "").rstrip("%").rstrip("pp")


def allowed_numbers(payload: dict) -> Set[str]:
    """Collect every numeric token present in the decision payload."""
    blob = json.dumps(payload, sort_keys=True)
    found = {_normalize(m.group("num")) for m in _NUMBER_RE.finditer(blob)}
    found |= set(_ALLOWLIST)
    # Also allow integer truncations of displayed one-decimal percents etc.
    extras: Set[str] = set()
    for n in list(found):
        try:
            f = float(n)
        except ValueError:
            continue
        extras.add(str(int(round(f))))
        extras.add(f"{f:.1f}")
        extras.add(f"{f:.2f}")
        extras.add(f"{f:.0f}")
    found |= {_normalize(x) for x in extras}
    return found


def find_unknown_numbers(text: str, payload: dict) -> List[str]:
    allowed = allowed_numbers(payload)
    unknown: List[str] = []
    for m in _NUMBER_RE.finditer(text):
        raw = m.group(0).strip()
        norm = _normalize(m.group("num"))
        if not norm:
            continue
        # Skip pure zeros / list indices that are allowlisted.
        if norm in allowed:
            continue
        # SKU grade fragments inside product names are fine (already allowlisted).
        unknown.append(raw)
    # Deduplicate, preserve order.
    seen: Set[str] = set()
    out: List[str] = []
    for u in unknown:
        key = _normalize(u)
        if key in seen:
            continue
        seen.add(key)
        out.append(u)
    return out


def guard(text: str, payload: dict) -> Tuple[bool, List[str]]:
    """Return (ok, list_of_offending_tokens)."""
    bad = find_unknown_numbers(text, payload)
    return (len(bad) == 0, bad)


def extract_numbers(text: str) -> Iterable[str]:
    for m in _NUMBER_RE.finditer(text):
        yield m.group(0).strip()
