#!/bin/bash
# Prevent Oracle from reclaiming free-tier instance (appear non-idle).
# Touches all 8 AI agents that expose HTTP. Deploy to server: /home/ubuntu/oci_keepalive.sh
# Cron: 0 */4 * * * /home/ubuntu/oci_keepalive.sh
# See: docs/ORACLE_ALL_PRODUCTS_RESILIENCE.md

LOG=/var/log/oci-keepalive.log
dd if=/dev/urandom bs=1M count=10 of=/dev/null 2>/dev/null
# 7+8 CTO AIPA + Atuona
curl -s -o /dev/null --max-time 5 http://127.0.0.1:3000/ || true
# 1 EspaLuz WhatsApp
curl -s -o /dev/null --max-time 5 http://127.0.0.1:8081/webhook || true
# 4 Algom Alpha (dragontrade-dashboard)
curl -s -o /dev/null --max-time 5 http://127.0.0.1:3001/ || true
echo "$(date -Iseconds): keepalive" >> "$LOG"
