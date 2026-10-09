#!/bin/bash
# archive-to-laptop.sh — copy Oracle folders/files to the laptop and PROVE the copy (9 Oct 2026 disk cleanup).
# Run on the LAPTOP (Git Bash):  bash scripts/oracle-resilience/archive-to-laptop.sh <abs-oracle-path> [...]
# Copies into D:/ORACLE_ARCHIVE_2026-10-09/<same absolute path>, then compares md5 of EVERY regular file on both ends.
# Prints "VERIFIED <path>" only when every file matched — only those may go into safe-remove.sh's list.
# Read-only on Oracle (tar + md5sum under nice/ionice). Files whose names Windows cannot store make the check fail -> kept.
set -uo pipefail
DEST=${DEST:-/d/ORACLE_ARCHIVE_2026-10-09}
mkdir -p "$DEST"
for src in "$@"; do
  rel=${src#/}
  echo "== $src"
  ssh oracle-cto-aipa "cd / && nice -n 15 ionice -c3 tar cf - '$rel'" | tar xf - -C "$DEST" 2> "$DEST/.tar-errors.txt" || true
  remote=$(ssh oracle-cto-aipa "cd / && find '$rel' -type f -print0 | nice -n 15 ionice -c3 xargs -0 -r md5sum" | sed -E 's/^([0-9a-f]{32}) [ *]?/\1  /' | sort -k2)
  local_=$( (cd "$DEST" && find "$rel" -type f -print0 | xargs -0 -r md5sum) | sed -E 's/^([0-9a-f]{32}) [ *]?/\1  /' | sort -k2)
  n_r=$(printf '%s\n' "$remote" | grep -c . ); n_l=$(printf '%s\n' "$local_" | grep -c . )
  if [ "$remote" = "$local_" ] && [ "$n_r" -gt 0 ]; then
    echo "VERIFIED $src ($n_r files)"; printf '%s\n' "$remote" >> "$DEST/MD5SUMS.txt"
  else
    echo "MISMATCH $src (oracle $n_r files, laptop $n_l) — NOT verified, keep on Oracle"
    diff <(printf '%s\n' "$remote") <(printf '%s\n' "$local_") | head -5
  fi
done
