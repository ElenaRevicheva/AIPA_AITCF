#!/bin/bash
# Run ON Oracle: POST /marketing/inquiry-proxy with fake token (expect captcha_failed JSON).
set -e
python3 <<'PY'
import json
open("/tmp/inq.json", "w", encoding="utf-8").write(
    json.dumps({
        "name": "t",
        "email": "t@t.com",
        "message": "m",
        "recaptcha_token": "badtoken",
    })
)
PY
curl -sS -X POST "http://127.0.0.1:3000/marketing/inquiry-proxy" \
  -H "Origin: https://aideazz.xyz" \
  -H "Content-Type: application/json" \
  -d @/tmp/inq.json
echo
