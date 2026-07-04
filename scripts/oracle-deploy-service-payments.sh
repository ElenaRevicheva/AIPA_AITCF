#!/usr/bin/env bash
# Deploy AIdeazz service payments (SVC:* PagueloFacil) — additive to EspaLuzFamilybot.
set -euo pipefail

FB="${ESPALUZ_FAMILYBOT_PATH:-/home/ubuntu/EspaLuzFamilybot}"
CTO="${CTO_AIPA_PATH:-/home/ubuntu/cto-aipa}"
HOOK_MARKER="AIDEAZZ_SVC_HOOK_START"

echo "=== backup paguelofacil_payments.json ==="
if [ -f "$FB/paguelofacil_payments.json" ]; then
  cp -a "$FB/paguelofacil_payments.json" "$FB/paguelofacil_payments.json.bak.$(date +%Y%m%d%H%M%S)"
fi

echo "=== copy aideazz_service_payments.py ==="
cp "$CTO/deploy/espaluz-familybot/aideazz_service_payments.py" "$FB/aideazz_service_payments.py"

echo "=== patch paypal_webhook_server.py (idempotent) ==="
if ! grep -q "$HOOK_MARKER" "$FB/paypal_webhook_server.py"; then
  python3 <<'PY'
from pathlib import Path
path = Path("/home/ubuntu/EspaLuzFamilybot/paypal_webhook_server.py")
text = path.read_text(encoding="utf-8")
needle = "        result = process_webhook(payload_json)"
hook = '''        # AIDEAZZ_SVC_HOOK_START
        try:
            from aideazz_service_payments import intercept_service_webhook
            svc_resp = intercept_service_webhook(payload_json)
            if svc_resp is not None:
                logging.info("PAGUELOFACIL SVC processed: %s", svc_resp)
                return jsonify({"status": "received", "result": svc_resp}), 200
        except Exception as svc_exc:
            logging.error("PAGUELOFACIL SVC hook error: %s", svc_exc)
        # AIDEAZZ_SVC_HOOK_END
        result = process_webhook(payload_json)'''
if needle not in text:
    raise SystemExit("paypal_webhook_server.py pattern not found — manual patch required")
path.write_text(text.replace(needle, hook, 1), encoding="utf-8")
print("hook inserted")
PY
else
  echo "hook already present"
fi

echo "=== sync PAGUELOFACIL_CCLW to cto-aipa .env if missing ==="
if [ -f "$FB/.env" ] && [ -f "$CTO/.env" ]; then
  if ! grep -q '^PAGUELOFACIL_CCLW=' "$CTO/.env" 2>/dev/null; then
    grep '^PAGUELOFACIL_CCLW=' "$FB/.env" >> "$CTO/.env" || true
    grep '^PAGUELOFACIL_SANDBOX=' "$FB/.env" >> "$CTO/.env" || true
    echo "appended PF vars to cto-aipa .env"
  fi
fi

echo "=== cto-aipa build + restart ==="
cd "$CTO"
git pull --ff-only origin main
npm run build
pm2 restart cto-aipa --update-env
sleep 3

echo "=== restart payments webhook ==="
sudo systemctl restart espaluz-payments-webhook 2>/dev/null || {
  pkill -f 'paypal_webhook_server.py' 2>/dev/null || true
  cd "$FB" && nohup python3 paypal_webhook_server.py >> /home/ubuntu/logs/espaluz-payments-webhook.log 2>&1 &
}
sleep 2

echo "=== smoke catalog ==="
curl -sf "http://127.0.0.1:3000/api/service-catalog" | head -c 400
echo ""
echo "=== DONE ==="
