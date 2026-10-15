"""1:1 with instruction.md numbered behaviours. Empty workspace must fail these."""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

WS = Path(os.environ.get("NL2REPO_WS", "/workspace"))


def failclosed(*args: str, allowlist: str | None):
    cwd = WS
    cwd.mkdir(parents=True, exist_ok=True)
    if allowlist is None:
        p = cwd / "allowlist.txt"
        if p.exists():
            p.unlink()
    else:
        (cwd / "allowlist.txt").write_text(allowlist, encoding="utf-8")
    return subprocess.run(
        ["failclosed", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
    )


def test_01_command_exists():
    """Spec 1: invoked as `failclosed STATEMENT`."""
    assert shutil.which("failclosed"), "command failclosed is not on PATH"


def test_02_reads_allowlist_in_cwd():
    """Spec 2: reads allowlist.txt in the current working directory."""
    r = failclosed("score 100", allowlist="100\n")
    assert r.returncode == 0
    assert r.stdout == "score 100\n"


def test_03_blank_allowlist_lines_ignored():
    """Spec 3: each non-empty line is one allowed token."""
    r = failclosed("score 100", allowlist="\n100\n\n")
    assert r.returncode == 0
    assert r.stdout == "score 100\n"


def test_04_digit_run_is_the_whole_number():
    """Spec 4: a number is a run of one or more digits (1001 is not 100)."""
    r = failclosed("id 1001", allowlist="100\n")
    assert r.returncode == 1
    assert r.stdout == ""
    assert r.stderr.strip() != ""


def test_05_every_number_allowed_prints_statement():
    """Spec 5: every number in the allowlist → print exactly, exit 0."""
    r = failclosed("score 100 of 100", allowlist="100\n")
    assert r.returncode == 0
    assert r.stdout == "score 100 of 100\n"


def test_05b_two_distinct_allowed_numbers():
    """Spec 5: more than one distinct allowed number."""
    r = failclosed("100 then 1900", allowlist="100\n1900\n")
    assert r.returncode == 0
    assert r.stdout == "100 then 1900\n"


def test_06_no_numbers_prints_statement():
    """Spec 6: no numbers → print exactly, exit 0."""
    r = failclosed("silence is correct", allowlist="100\n")
    assert r.returncode == 0
    assert r.stdout == "silence is correct\n"


def test_07_unknown_number_prints_nothing_exits_1():
    """Spec 7: a number missing from the allowlist → empty stdout, stderr, exit 1."""
    r = failclosed("we made 999 sales", allowlist="100\n")
    assert r.returncode == 1
    assert r.stdout == ""
    assert r.stderr.strip() != ""


def test_08_missing_allowlist_prints_nothing_exits_1():
    """Spec 8: allowlist.txt missing → empty stdout, stderr, exit 1."""
    r = failclosed("score 100 of 100", allowlist=None)
    assert r.returncode == 1
    assert r.stdout == ""
    assert r.stderr.strip() != ""
