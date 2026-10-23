#!/usr/bin/env python3
"""Golden must pass the Harbor tests. Empty PATH must fail them.

No Docker. Proves the NL2Repo sample is not a listing wrapper.
"""
from __future__ import annotations

import os
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TASK = ROOT / "docs/selling/harbor/nl2repo-fail-closed-gate"
GOLDEN = TASK / "solution/failclosed.py"
TESTS = TASK / "tests/test_behavior.py"
SPEC = TASK / "environment/spec.md"
INSTRUCTION = TASK / "instruction.md"


def run(cmd, env, cwd=None):
    return subprocess.run(
        cmd,
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
    )


def main() -> int:
    if not GOLDEN.is_file() or not TESTS.is_file():
        print("FAIL: Harbor sample files missing", file=sys.stderr)
        return 1
    if SPEC.read_text(encoding="utf-8") != INSTRUCTION.read_text(encoding="utf-8"):
        print("FAIL: environment/spec.md must match instruction.md", file=sys.stderr)
        return 1

    with tempfile.TemporaryDirectory(prefix="nl2repo-gate-") as tmp:
        tmp_path = Path(tmp)
        ws = tmp_path / "workspace"
        bindir = tmp_path / "bin"
        ws.mkdir()
        bindir.mkdir()
        dest = bindir / "failclosed"
        shutil.copy(GOLDEN, dest)
        dest.chmod(dest.stat().st_mode | stat.S_IEXEC)

        env = os.environ.copy()
        env["PATH"] = f"{bindir}{os.pathsep}{env.get('PATH', '')}"
        env["NL2REPO_WS"] = str(ws)
        env["PYTHONDONTWRITEBYTECODE"] = "1"

        pytest = [
            sys.executable,
            "-m",
            "pytest",
            "-q",
            "-o",
            f"cache_dir={tmp_path / 'pytest-cache'}",
            str(TESTS),
        ]
        golden = run(pytest + ["--tb=short"], env)
        print("--- golden (command on PATH) ---")
        sys.stdout.write(golden.stdout)
        sys.stdout.write(golden.stderr)
        if golden.returncode != 0:
            print("FAIL: golden implementation did not pass behaviour tests")
            return 1
        print("PASS: golden implementation passed behaviour tests")

        dest.unlink()
        empty = run(pytest + ["--tb=no"], env)
        print("--- empty (no failclosed on PATH) ---")
        sys.stdout.write(empty.stdout)
        if empty.returncode == 0:
            print("FAIL: empty workspace passed — false positive")
            return 1
        print("PASS: empty workspace failed the same tests")

    required = [
        TASK / "task.toml",
        TASK / "instruction.md",
        TASK / "environment/Dockerfile",
        TASK / "environment/spec.md",
        TASK / "tests/test.sh",
        TASK / "tests/test_behavior.py",
        TASK / "solution/solve.sh",
        TASK / "solution/failclosed.py",
    ]
    missing = [str(p) for p in required if not p.is_file()]
    if missing:
        print("FAIL: Harbor layout missing:", *missing, sep="\n  ")
        return 1
    toml = (TASK / "task.toml").read_text(encoding="utf-8")
    if 'name = "nl2repo-fail-closed-gate"' not in toml:
        print("FAIL: task.toml name mismatch")
        return 1
    if "allow_internet = false" not in toml:
        print("FAIL: sample must be offline")
        return 1
    print("PASS: Harbor layout present, offline, named")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
