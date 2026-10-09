#!/bin/bash
# compress-verified.sh <file>... — gzip each file; the original is removed ONLY if the .gz unpacks to exactly the original bytes.
# Used for logs that are no longer written (rotated PM2 logs, the 842 MB PM2 daemon log). 9 Oct 2026 disk cleanup.
for f in "$@"; do
  [ -f "$f" ] || { echo "SKIP (missing) $f"; continue; }
  case "$f" in *.gz) echo "SKIP (already gz) $f"; continue;; esac
  if lsof -t -- "$f" >/dev/null 2>&1; then echo "SKIP (open by a process) $f"; continue; fi
  orig=$(stat -c %s "$f")
  nice -n 15 ionice -c3 gzip -6 -k -f "$f" || { echo "FAIL gzip $f"; continue; }
  back=$(zcat "$f.gz" | wc -c)
  if [ "$orig" = "$back" ]; then touch -r "$f" "$f.gz"; rm -f -- "$f"; echo "OK $(( orig/1048576 )) MB -> $(( $(stat -c %s "$f.gz")/1048576 )) MB  $f"
  else rm -f -- "$f.gz"; echo "MISMATCH (kept original) $f"; fi
done
