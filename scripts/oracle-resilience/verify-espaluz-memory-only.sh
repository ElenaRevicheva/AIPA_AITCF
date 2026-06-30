#!/bin/bash
# Read-only health check — no code changes, no restarts. Safe from phone anytime.
set -euo pipefail

CTO="${CTO_AIPCF_DIR:-/home/ubuntu/cto-aipa}"
WA="${ESPALUZ_WHATSAPP_DIR:-/home/ubuntu/EspaLuzWhatsApp}"

echo "=== EspaLuz memory + service verify (read-only) ==="
chmod +x "$CTO/scripts/oracle-resilience/"*.sh 2>/dev/null || true
bash "$CTO/scripts/oracle-resilience/verify-espaluz-memory-persistence.sh" || true

echo
echo "=== systemd ==="
systemctl is-active espaluz-whatsapp espaluz-familybot espaluz-payments-webhook 2>/dev/null || true

echo
echo "=== webhooks (local) ==="
curl -s -o /dev/null -w "WhatsApp :8081 → HTTP %{http_code}\n" --max-time 8 http://127.0.0.1:8081/webhook || true
curl -s -o /dev/null -w "Payments :5000 /health → HTTP %{http_code}\n" --max-time 8 http://127.0.0.1:5000/health || true

echo "=== Done (no changes made) ==="
