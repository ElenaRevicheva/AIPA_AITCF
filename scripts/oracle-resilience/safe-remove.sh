#!/bin/bash
# safe-remove.sh — the ONLY way paths are removed from Oracle during a disk cleanup (9 Oct 2026).
#   bash safe-remove.sh <list-file> [--apply]        (default = DRY RUN: prints what it would do, removes nothing)
# <list-file>: one absolute path per line; '#' comments allowed. Every path must have been classified GARBAGE or DUPLICATE /
# ARCHIVED (md5-verified copy on the laptop) — see docs/oracle/ORACLE_DISK_CLEANUP_2026-10-09.md.
# Refuses: protected paths (live products, the never-clean list, film #9 approved assets), anything outside /home/ubuntu,
# /tmp, /var/cache/apt; any path a running process has open (cwd, exe or file). Logs every action to ~/safe-remove.log.
set -uo pipefail
LIST=${1:?list file}; APPLY=${2:-}
LOG=/home/ubuntu/safe-remove.log
PROTECT='^/home/ubuntu/(cto-aipa|EspaLuzWhatsApp|EspaLuzFamilybot|EspaLuz_Influencer|dragontrade-agent|VibeJobHunterAIPA_AIMCF|openclaw-vibejob-shortlist|whitespace|aideazz|job-list-filter|\.openclaw|\.pm2|\.n8n|\.ssh|\.config|bin)(/|$)|^/home/ubuntu/\.cache/(ms-playwright|n8n)(/|$)|^/home/ubuntu/\.npm/_npx(/|$)|^/home/ubuntu/atuona-film9/(img|clips|stillclips|music|plan\.json|gen\.mjs|ledger\.jsonl|vo)(/|$)|^/home/ubuntu/[^/]+\.(sh|env)$'
ALLOW='^(/home/ubuntu/|/tmp/|/var/cache/apt/)'
stamp() { date -u +%FT%TZ; }
# every path any running process holds (cwd, executable, open files), once
OPEN=$(sudo -n lsof -w -n -P -F n 2>/dev/null | sed -n 's/^n//p' | grep -E '^/(home/ubuntu|tmp|var/cache)' | sort -u)
CWDS=$(for p in /proc/[0-9]*; do readlink "$p/cwd" 2>/dev/null; readlink "$p/exe" 2>/dev/null; done | sort -u)
total=0
while IFS= read -r path; do
  path=${path%%#*}; path=$(echo "$path" | xargs); [ -z "$path" ] && continue
  if [ ! -e "$path" ]; then echo "SKIP (gone)        $path"; continue; fi
  if ! [[ "$path" =~ $ALLOW ]]; then echo "REFUSE (outside)   $path"; continue; fi
  if [[ "$path" =~ $PROTECT ]] || [ "$path" = "/home/ubuntu" ] || [ "$path" = "/tmp" ]; then echo "REFUSE (protected) $path"; continue; fi
  # in use = some running process has this exact path, or anything under it, open / as cwd / as its executable
  if printf '%s\n%s\n' "$OPEN" "$CWDS" | awk -v p="$path" '$0==p || index($0, p "/")==1 {f=1} END {exit !f}'; then
    echo "REFUSE (in use)    $path"; continue; fi
  mb=$(du -sm "$path" 2>/dev/null | cut -f1); total=$((total + ${mb:-0}))
  if [ "$APPLY" = "--apply" ]; then
    if rm -rf -- "$path"; then echo "$(stamp) REMOVED ${mb} MB $path" | tee -a "$LOG"; else echo "$(stamp) FAILED $path" | tee -a "$LOG"; fi
  else echo "WOULD REMOVE ${mb} MB  $path"; fi
done < "$LIST"
echo "total: ${total} MB $( [ "$APPLY" = "--apply" ] && echo removed || echo 'would be removed (dry run)' ) · df: $(df -h / | awk 'NR==2{print $5" used, "$4" free"}')"
