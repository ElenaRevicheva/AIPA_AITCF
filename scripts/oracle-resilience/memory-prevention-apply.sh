#!/bin/bash
# Memory prevention for the Oracle VM — re-runnable (each step checks before it acts). Run as ubuntu: bash memory-prevention-apply.sh
#
# Why (4 Nov 2026): an ad-hoc ssh one-liner from an agent defined a shell function named `cut` that called `cut` -> infinite
# recursion, 1,914 bash, RAM 29% -> 99% in 10 min. 12 GB RAM, NO swap -> the whole box froze 16:31 -> 19:30 UTC and every bot
# was down until a force reboot. The 9 Oct prevention (disk-prevention-apply.sh) covered disk only.
#
# 1. Containment: every SSH / login session (agents, Cursor, Elena) runs in its own `session-N.scope`. A drop-in caps EACH
#    session at 3 GB RAM (+512 MB swap, so it cannot hide in the swap file) and 1,500 processes, so a runaway is killed inside its own session. No MemoryHigh on purpose: tested 4 Nov, it only THROTTLED a
#    runaway python at 2.8 GB and left it hanging there for minutes holding the RAM; MemoryMax alone kills it. Not affected: the bots
#    (systemd system services), PM2 (pm2-ubuntu.service), cron jobs (cron.service), OpenClaw (its systemd user service).
# 2. Cushion: a 4 GB swap file with swappiness 10 (used only under pressure), so the box slows down instead of freezing.
# The Telegram memory alarm lives in ~/health_monitor.sh (repo docs/oracle/health_monitor.sh).
set -euo pipefail

say(){ echo "[memory-prevention] $*"; }

# ---- 1. per-session cap -------------------------------------------------------------------------------------------------
DROP=/etc/systemd/system/session-.scope.d/50-aideazz-cap.conf
WANT=$'# 4 Nov 2026: one runaway session must not freeze the box (memory-prevention-apply.sh)\n[Scope]\nMemoryMax=3G\nMemorySwapMax=512M\nTasksMax=1500\n'
if [ "$(sudo cat "$DROP" 2>/dev/null)" != "$(printf '%s' "$WANT")" ]; then
  sudo mkdir -p "$(dirname "$DROP")"
  printf '%s' "$WANT" | sudo tee "$DROP" >/dev/null
  sudo systemctl daemon-reload
  say "session cap written: $DROP (applies to NEW sessions)"
else
  say "session cap already in place"
fi

# ---- 2. swap ------------------------------------------------------------------------------------------------------------
if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  FREE_GB=$(df --output=avail -BG / | tail -1 | tr -dc 0-9)
  [ "$FREE_GB" -ge 10 ] || { say "REFUSED: only ${FREE_GB} GB free, need 10+ for a 4 GB swap file"; exit 1; }
  [ -e /swapfile ] || { sudo fallocate -l 4G /swapfile; sudo chmod 600 /swapfile; sudo mkswap /swapfile >/dev/null; }
  sudo swapon /swapfile
  say "swap on: /swapfile 4G"
else
  say "swap already on"
fi
grep -q '^/swapfile ' /etc/fstab || { echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null; say "fstab: swap survives reboot"; }
SYSCTL=/etc/sysctl.d/60-aideazz-swap.conf
[ -f "$SYSCTL" ] || { echo 'vm.swappiness=10' | sudo tee "$SYSCTL" >/dev/null; say "swappiness 10 written"; }
sudo sysctl -q -p "$SYSCTL"

say "now: $(swapon --show --noheadings | tr -s ' ') · swappiness $(cat /proc/sys/vm/swappiness)"
