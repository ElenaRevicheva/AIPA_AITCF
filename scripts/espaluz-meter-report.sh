#!/usr/bin/env bash
# EspaLuz token meter — daily sum of the "[meter]" lines (4 Nov 2026, Phase 0 of docs/espaluz/MODEL_COST_STRATEGY_2026-11-03.md).
# Run ON Oracle:  bash ~/cto-aipa/scripts/espaluz-meter-report.sh [since]   (default: "24 hours ago")
# Reads the WhatsApp + Telegram service journals. Web lines ("ch=web") live in the Supabase espaluz-chat logs.
# Output: one row per channel/provider/model: calls, tokens in, tokens out — the measured answer to "what does a day cost".
set -euo pipefail
SINCE="${1:-24 hours ago}"
sudo journalctl -u espaluz-whatsapp -u espaluz-familybot --since "$SINCE" --no-pager -o cat 2>/dev/null \
  | grep -o '\[meter\] ch=[^ ]* p=[^ ]* m=[^ ]* in=[0-9]* out=[0-9]*' \
  | awk '{ split($2,c,"="); split($3,p,"="); split($4,m,"="); split($5,i,"="); split($6,o,"=");
           k=c[2]" "p[2]" "m[2]; n[k]++; ti[k]+=i[2]; to[k]+=o[2]; TI+=i[2]; TO+=o[2]; N++ }
         END { printf "%-4s %-8s %-34s %6s %10s %9s\n","ch","provider","model","calls","tokens_in","tokens_out";
               for (k in n) { split(k,a," "); printf "%-4s %-8s %-34s %6d %10d %9d\n",a[1],a[2],a[3],n[k],ti[k],to[k] }
               printf "TOTAL %d calls, %d tokens in, %d tokens out\n", N, TI, TO }'
