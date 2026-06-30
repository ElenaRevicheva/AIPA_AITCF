#!/bin/bash
# Verify EspaLuz memory layers survive redeploy (PostgreSQL + JSON on disk).
# Safe to run before/after any bot restart. Does NOT modify data.
set -euo pipefail

WA_DIR="${ESPALUZ_WHATSAPP_DIR:-/home/ubuntu/EspaLuzWhatsApp}"
TG_DIR="${ESPALUZ_FAMILYBOT_DIR:-/home/ubuntu/EspaLuzFamilybot}"

echo "=== EspaLuz memory persistence check ==="
echo "WhatsApp dir: $WA_DIR"
echo "Telegram dir: $TG_DIR"
echo

check_file() {
  local label="$1" path="$2"
  if [[ -f "$path" ]]; then
    local size lines
    size=$(stat -c%s "$path" 2>/dev/null || stat -f%z "$path")
    lines=$(wc -l < "$path" | tr -d ' ')
    echo "OK  $label — ${size} bytes, ${lines} lines — $path"
  elif [[ -d "$path" ]]; then
    local count
    count=$(find "$path" -type f 2>/dev/null | wc -l | tr -d ' ')
    echo "OK  $label — $count files — $path/"
  else
    echo "MISSING  $label — $path (may be new user / not yet created)"
  fi
}

echo "--- JSON / disk layers (survive code redeploy if not overwritten) ---"
check_file "WA family profiles" "$WA_DIR/family_memory_data/user_profiles.json"
check_file "WA conversation history" "$WA_DIR/family_memory_data/conversation_history.json"
check_file "WA emotional JSON" "$WA_DIR/emotional_data"
check_file "WA onboarding FSM" "$WA_DIR/onboarding_state.json"
check_file "WA trials" "$WA_DIR/user_trials.json"
check_file "TG user sessions" "$TG_DIR/user_sessions.json"
check_file "TG onboarding" "$TG_DIR/user_onboarding.json"
check_file "TG PagueloFacil access" "$TG_DIR/paguelofacil_payments.json"
echo

echo "--- PostgreSQL unified (survive redeploy; independent of bot process) ---"
set -a
# shellcheck disable=SC1091
source "$WA_DIR/.env" 2>/dev/null || true
set +a

if [[ -f /home/ubuntu/cto-aipa/scripts/oracle-resilience/check_memory_pg.py ]]; then
  "$WA_DIR/venv/bin/python3" /home/ubuntu/cto-aipa/scripts/oracle-resilience/check_memory_pg.py || true
elif [[ -f /tmp/check_memory_pg.py ]]; then
  "$WA_DIR/venv/bin/python3" /tmp/check_memory_pg.py || true
else
  echo "WARN  check_memory_pg.py not found — run from cto-aipa/scripts/oracle-resilience/"
fi

echo
echo "--- Code markers (session UUID alignment) ---"
grep -q get_session_uuid "$WA_DIR/espaluz_memory.py" && echo "OK  WA espaluz_memory.py has get_session_uuid" || echo "WARN  WA memory module missing get_session_uuid"
grep -q get_session_uuid "$TG_DIR/espaluz_memory.py" && echo "OK  TG espaluz_memory.py has get_session_uuid" || echo "WARN  TG memory module missing get_session_uuid"
echo
echo "--- In-memory only (expected loss on restart; not long-term memory) ---"
echo "  • WhatsApp MOTIVATIONAL/TRANSLATE mode sessions (~5 min TTL)"
echo "  • Pending Atlas attribution map in trial system"
echo
echo "=== Safe redeploy rules ==="
echo "  • Prefer: git checkout SPECIFIC .py files OR scp single files"
echo "  • Never: rsync/scp full repo over prod JSON or family_memory_data/"
echo "  • .env is never overwritten by deploy scripts"
echo "=== Done ==="
