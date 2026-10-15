#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
DEST="${1:-/workspace}"
cp -a "$ROOT/failclosed.py" "$DEST/failclosed.py"
chmod +x "$DEST/failclosed.py"
# Install as the `failclosed` command without setuptools.
ln -sfn "$DEST/failclosed.py" /usr/local/bin/failclosed
chmod +x /usr/local/bin/failclosed
