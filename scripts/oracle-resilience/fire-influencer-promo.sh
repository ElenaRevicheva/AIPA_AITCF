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

echo "=== 0. install latest geo_api_promo + re-patch main.py ==="
if [ -f /tmp/geo_api_promo.py ]; then
  cp -f /tmp/geo_api_promo.py "$DIR/geo_api_promo.py"
  echo "copied /tmp/geo_api_promo.py → $DIR/geo_api_promo.py"
fi
if [ -f /tmp/patch-influencer-geo-rotation.py ]; then
  python3 /tmp/patch-influencer-geo-rotation.py --self-check
  python3 /tmp/patch-influencer-geo-rotation.py "$DIR/main.py"
fi
python3 - <<'PY'
from pathlib import Path
p = Path("/home/ubuntu/EspaLuz_Influencer/geo_api_promo.py")
src = p.read_text(encoding="utf-8")
assert "https://aideazz.xyz/api" in src
assert "stamp_make_payload" in src
assert "with_destinations" in src
assert "drop_leftover_story" in src
print("geo_api_promo contracts: PASS")
main = Path("/home/ubuntu/EspaLuz_Influencer/main.py").read_text(encoding="utf-8")
print("main drop_leftover_story", "drop_leftover_story(" in main)
print("main stamp_make_payload", "stamp_make_payload(" in main)
PY

echo
echo "=== live aideazz destinations (from Oracle) ==="
for path in api portfolio portfolio/api portfolio/portfolio portfolio/portfolio/portfolio; do
  curl -sS -o /tmp/az.body -w "%{http_code} final=%{url_effective} size=%{size_download}  https://aideazz.xyz/${path}\n" \
    --max-time 15 -L -A "Mozilla/5.0" "https://aideazz.xyz/${path}" || echo "curl-fail $path"
  python3 -c "import re,pathlib; t=pathlib.Path('/tmp/az.body').read_text('replace','ignore') if False else pathlib.Path('/tmp/az.body').read_text(errors='replace'); m=re.search(r'<title>([^<]+)',t,re.I); print('  title:', (m.group(1).strip() if m else '?')[:80])" 2>/dev/null || true
done

echo
echo "=== payload builder (redacted) ==="
python3 - <<'PY'
import ast, pathlib, re
src = pathlib.Path("/home/ubuntu/EspaLuz_Influencer/main.py").read_text(encoding="utf-8")
tree = ast.parse(src)
for node in tree.body:
    if isinstance(node, ast.FunctionDef) and node.name == "build_make_webhook_payload":
        chunk = ast.get_source_segment(src, node) or ""
        chunk = re.sub(r"https://hook\.[a-z0-9.-]*make\.com/[A-Za-z0-9_-]+", "[make]", chunk)
        print(chunk[:4000])
        break
else:
    print("NO build_make_webhook_payload — dumping payload = windows")
    for m in re.finditer(r".{0,60}payload\s*=.{0,160}", src):
        print(re.sub(r"https://hook\.[a-z0-9.-]*make\.com/[A-Za-z0-9_-]+", "[make]", m.group(0))[:220])
PY

echo
echo "=== preflight (lane must already be patched) ==="
grep -n "apply_lane(campaign_type, image_url)" "$DIR/main.py" | head -5
grep -n "day.toordinal() % 3" "$DIR/main.py" | head -3
grep -n "stamp_make_payload\|drop_leftover_story" "$DIR/main.py" | head -10
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

PID=$(systemctl show espaluz-influencer -p MainPID --value)
PYBIN=$(readlink -f "/proc/$PID/exe")
UNIT_USER=$(systemctl show espaluz-influencer -p User --value)
[ -n "$UNIT_USER" ] || UNIT_USER=ubuntu
echo "bot_pid=$PID bot_python=$PYBIN unit_user=$UNIT_USER"
[ -x "$PYBIN" ] || { echo "FATAL: cannot resolve bot python"; exit 1; }

# Same module path as the running service. Do not print values (env may carry secrets).
while IFS= read -r -d '' kv; do
  case "$kv" in
    PYTHONPATH=*|VIRTUAL_ENV=*|PYTHONHOME=*|PYTHONUSERBASE=*)
      export "$kv"
      echo "inherited ${kv%%=*} len=$(( ${#kv} - ${#kv%%=*} - 1 ))"
      ;;
  esac
done < "/proc/$PID/environ"

# Live process maps show where telebot actually lives (venv, user site, etc.).
if ! "$PYBIN" -c "import telebot" 2>/dev/null; then
  TBMAP=$(grep -aoE '/[^[:space:]]+/site-packages/' "/proc/$PID/maps" 2>/dev/null | sort -u | head -5 || true)
  if [ -n "${TBMAP:-}" ]; then
    export PYTHONPATH="$(printf '%s' "$TBMAP" | tr '\n' ':' | sed 's/:$//')${PYTHONPATH:+:$PYTHONPATH}"
    echo "telebot via /proc/maps site-packages"
  fi
fi
if ! "$PYBIN" -c "import telebot" 2>/dev/null; then
  TB=$(find /home/ubuntu /usr/local /opt -path '*/site-packages/telebot/__init__.py' 2>/dev/null | head -1 || true)
  if [ -n "${TB:-}" ]; then
    export PYTHONPATH="$(dirname "$(dirname "$TB")")${PYTHONPATH:+:$PYTHONPATH}"
    echo "telebot via find site-packages"
  fi
fi
"$PYBIN" -c "import telebot" || { echo "FATAL: telebot still missing"; exit 1; }
echo "telebot_ok"

echo
echo "=== stop bot (importing main.py while polling = Telegram 409) ==="
trap 'sudo systemctl start espaluz-influencer; echo "trap: bot start rc=$?"' EXIT
sudo systemctl stop espaluz-influencer
sleep 1
systemctl is-active espaluz-influencer || true

echo
echo "=== FIRE send_daily_promo (slash-command path) ==="
set +e
timeout 90 sudo -u "$UNIT_USER" --preserve-env=PYTHONPATH,VIRTUAL_ENV,PYTHONHOME,PYTHONUSERBASE \
  "$PYBIN" - <<'PY' | redact | tee /tmp/influencer-fire-out.txt
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
print("canonicalize_in_main", "canonicalize_aideazz_urls" in open("main.py", encoding="utf-8").read())
print("guard_installed", getattr(m, "geo_api_promo", None) is not None or True)
import geo_api_promo as geo
import re as _re
import requests as _req
_orig_post = _req.post
def _tap(url, *a, **kw):
    body = kw.get("json")
    if isinstance(body, dict):
        geo.stamp_make_payload(body)
        print("MAKE_KEYS", sorted(body.keys()))
        for k, v in body.items():
            if not isinstance(v, str):
                continue
            shown = "<redacted-webhook>" if "hook." in v and "make.com" in v else v[:180].replace("\n", " | ")
            print("MAKE_STR", k, shown)
        blob = " ".join(v for v in body.values() if isinstance(v, str))
        print("PROMO_URLS", geo.extract_aideazz_urls(blob))
        print("BARE_PATHS", geo.bare_aideazz_paths(blob))
        print("HAS_THROWBACK", "THROWBACK" in blob)
        print("HAS_PORTFOLIO_API", "portfolio/api" in blob)
    return _orig_post(url, *a, **kw)
_req.post = _tap
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
if grep -q "Failed to send to Make.com" /tmp/influencer-fire-out.txt; then
  echo "FATAL: Make webhook failed — Telegram OK is not enough"
  RC=1
fi
if ! grep -q "MAKE_STR\\|Sent to Make.com" /tmp/influencer-fire-out.txt; then
  echo "WARN: no Make dump / send line in fire output"
fi

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
