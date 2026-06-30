#!/bin/bash
# Deploy memory hardening: unified session UUID + safe deploy tooling.
# Run on Oracle VM (or via GitHub Actions SSH):
#   bash /home/ubuntu/cto-aipa/scripts/oracle-resilience/deploy-memory-hardening-on-oracle.sh
set -euo pipefail

WA="${ESPALUZ_WHATSAPP_DIR:-/home/ubuntu/EspaLuzWhatsApp}"
TG="${ESPALUZ_FAMILYBOT_DIR:-/home/ubuntu/EspaLuzFamilybot}"
CTO="${CTO_AIPCF_DIR:-/home/ubuntu/cto-aipa}"

echo "=== Pull latest from GitHub ==="
for repo in "$WA" "$TG" "$CTO"; do
  if [[ -d "$repo/.git" ]]; then
    echo "--- $repo ---"
    cd "$repo"
    git fetch origin main
    git checkout origin/main -- espaluz_memory.py 2>/dev/null || true
    if [[ "$repo" == "$WA" ]]; then
      git checkout origin/main -- .gitignore config/setup_unified_db.sql config/migrations/001_espaluz_embeddings.sql scripts/deployment/deploy-and-restart-oracle.ps1 2>/dev/null || true
    fi
    if [[ "$repo" == "$TG" ]]; then
      git checkout origin/main -- .gitignore 2>/dev/null || true
    fi
    if [[ "$repo" == "$CTO" ]]; then
      git checkout origin/main -- scripts/oracle-resilience/check_memory_pg.py scripts/oracle-resilience/verify-espaluz-memory-persistence.sh scripts/oracle-resilience/inspect_telegram_memory.py scripts/espaluz-hotfixes/deploy-whatsapp-checkout-and-restart.sh 2>/dev/null || true
    fi
  fi
done

echo "=== RAG table migration (idempotent) ==="
set -a
# shellcheck disable=SC1091
source "$WA/.env"
set +a
export PGPASSWORD=""
if command -v psql >/dev/null && [[ -n "${ESPALUZ_UNIFIED_DB_URL:-}" ]]; then
  psql "$ESPALUZ_UNIFIED_DB_URL" -f "$WA/config/migrations/001_espaluz_embeddings.sql" || echo "WARN migration (may already exist)"
else
  "$WA/venv/bin/python3" - <<'PY' || true
import os, psycopg2
from dotenv import load_dotenv
load_dotenv("/home/ubuntu/EspaLuzWhatsApp/.env")
url = os.getenv("ESPALUZ_UNIFIED_DB_URL") or os.getenv("DATABASE_URL_UNIFIED")
sql = open("/home/ubuntu/EspaLuzWhatsApp/config/migrations/001_espaluz_embeddings.sql").read()
conn = psycopg2.connect(url)
conn.autocommit = True
cur = conn.cursor()
for stmt in sql.split(";"):
    s = stmt.strip()
    if s and not s.startswith("--"):
        try:
            cur.execute(s)
        except Exception as e:
            print("migration stmt:", e)
conn.close()
print("migration via python done")
PY
fi

echo "=== Restart bots (memory reloads from PG + JSON; data NOT wiped) ==="
sudo systemctl restart espaluz-whatsapp espaluz-familybot
sleep 3
sudo systemctl is-active espaluz-whatsapp espaluz-familybot

echo "=== Verify persistence ==="
chmod +x "$CTO/scripts/oracle-resilience/verify-espaluz-memory-persistence.sh" 2>/dev/null || true
bash "$CTO/scripts/oracle-resilience/verify-espaluz-memory-persistence.sh" || true

echo "=== Telegram memory stack ==="
"$WA/venv/bin/python3" "$CTO/scripts/oracle-resilience/inspect_telegram_memory.py" || true

echo "=== Done ==="
