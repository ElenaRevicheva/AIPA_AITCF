#!/usr/bin/env bash
# Fire EspaLuz Influencer daily promo NOW (same path as /daily_promo).
# Piped over SSH (mode=fire). Never prints secrets / Make URLs.
set -euo pipefail

MODE="${1:-fire}"
DIR=/home/ubuntu/EspaLuz_Influencer

redact() {
  sed -E \
    -e 's#https://hook\.[a-z0-9.-]*make\.com/[A-Za-z0-9_-]+#[make-webhook-redacted]#g' \
    -e 's#(Bearer[[:space:]]+)[A-Za-z0-9._+/=-]{8,}#\1[REDACTED]#g' \
    -e 's#(bot)[0-9]+:[A-Za-z0-9_-]+#\1[REDACTED]#g' \
    -e 's#\b[0-9a-fA-F]{32,}\b#[REDACTED_HEX]#g' \
    -e 's#(MAKE_[A-Z0-9_]*WEBHOOK[A-Z0-9_]*=).*#\1[REDACTED]#g'
}

echo "=== influencer-fire $(date -u +%Y-%m-%dT%H:%M:%SZ) mode=$MODE ==="
[ "$MODE" = "fire" ] || { echo "expected mode=fire"; exit 1; }
[ -f "$DIR/main.py" ] || { echo "FATAL: main.py missing"; exit 1; }

echo "=== preflight (lane must already be patched) ==="
grep -n "apply_lane(campaign_type, image_url)" "$DIR/main.py" | head -5
grep -n "day.toordinal() % 3" "$DIR/main.py" | head -3
python3 - <<'PY'
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import sys
sys.path.insert(0, "/home/ubuntu/EspaLuz_Influencer")
from geo_api_promo import is_geo_day, next_geo_image
now = datetime.now(timezone.utc)
pan = now.astimezone(ZoneInfo("America/Panama"))
print(f"panama={pan.isoformat()} geo_day={is_geo_day(now)}")
print(f"next_geo_stem={next_geo_image({'geo_api_image_rotation_index': 0}).rsplit('/',1)[-1]}")
PY

echo
echo "=== stop bot (importing main.py while polling = Telegram 409) ==="
trap 'sudo systemctl start espaluz-influencer; echo "trap: bot start rc=$?"' EXIT
sudo systemctl stop espaluz-influencer
sleep 1
systemctl is-active espaluz-influencer || true

echo
echo "=== FIRE send_daily_promo (slash-command path) ==="
set +e
timeout 90 python3 - <<'PY' | redact
import os, sys, traceback
os.chdir("/home/ubuntu/EspaLuz_Influencer")
sys.path.insert(0, ".")
import main as m

class Chat:
    id = getattr(m, "TELEGRAM_CHAT_ID", None)

class Msg:
    text = "/daily_promo"
    chat = Chat()
    message_id = 0
    from_user = None
    html_text = "/daily_promo"
    caption = None
    content_type = "text"

print("apply_lane_in_main", "apply_lane" in open("main.py", encoding="utf-8").read())
try:
    m.send_daily_promo(Msg())
    print("FIRE_RESULT send_daily_promo OK")
except Exception:
    traceback.print_exc()
    print("FIRE_RESULT send_daily_promo FAIL — falling back to send_automated_daily_promo")
    try:
        m.send_automated_daily_promo()
        print("FIRE_RESULT send_automated_daily_promo OK")
    except Exception:
        traceback.print_exc()
        print("FIRE_RESULT BOTH_FAILED")
        raise SystemExit(1)
PY
RC=${PIPESTATUS[0]}
set -e
echo "python_rc=$RC"

echo
echo "=== restart bot ==="
trap - EXIT
sudo systemctl start espaluz-influencer
sleep 2
systemctl is-active espaluz-influencer
systemctl show espaluz-influencer -p ActiveEnterTimestamp -p MainPID -p SubState
journalctl -u espaluz-influencer --since "90 seconds ago" --no-pager | redact | tail -40

echo
echo "=== DONE influencer-fire rc=$RC ==="
echo "Telegram photo should be in the channel. Buffer/IG/LI only if Make 3044021 is ON."
echo "Do not click Make Run once — that replays an old payload."
exit "$RC"
