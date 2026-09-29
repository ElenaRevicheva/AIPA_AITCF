#!/usr/bin/env python3
"""
The PagueloFacil webhook receiver on Oracle serves EVERY PagueloFacil payment on the account.
aideazz_service_payments.intercept_service_webhook must claim AIdeazz service payments and
leave everything else alone. Network is mocked — nothing is sent.

    python scripts/test-service-payment-forwarder.py
"""
import os
import sys
from unittest import mock

# Mirrors Oracle: the receiver's INTERNAL_WEBHOOK_SECRET is EspaLuz's own; CTO AIPA accepts OUTREACH_SECRET.
os.environ["INTERNAL_WEBHOOK_SECRET"] = "espaluz-own"
os.environ["OUTREACH_SECRET"] = "cto-accepts"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "deploy", "espaluz-familybot"))
import aideazz_service_payments as s  # noqa: E402

sent = []
fails = 0


class _Resp:
    def __init__(self, code):
        self.status_code = code
        self.text = "{}" if code == 200 else '{"error":"Unauthorized"}'

    def json(self):
        return {"ok": True}


auth_seen = []


def _post(url, json=None, headers=None, timeout=None):
    auth_seen.append(headers["Authorization"])
    if headers["Authorization"] != "Bearer cto-accepts":
        return _Resp(401)
    sent.append(json)
    return _Resp(200)


def ok(cond, name):
    global fails
    print(("PASS " if cond else "FAIL ") + name)
    fails += 0 if cond else 1


with mock.patch.object(s.requests, "post", side_effect=_post):
    # The real 29 Sep 2026 payload shape: no PARM_1, description echoed with accents stripped.
    paid = {
        "codOper": "LK-UXYXTFZXXPXT", "relatedTx": "LK-MBU3H0NVJ6IW", "status": 1, "authStatus": "00",
        "messageSys": "Transaction is approved", "operationType": "AUTH_CAPTURE",
        "description": "AIdeazz  Diagnstico rpido AI Growth Operator  AIdeazz AI Lab",
        "totalPay": "100.0", "email": "payer@example.com",
    }
    r = s.intercept_service_webhook(paid)
    ok(r is not None and r.get("processed") is True, "AIdeazz payment without PARM_1 is forwarded")
    ok(sent[-1]["total_pay"] == "100.0" and sent[-1]["payer_email"] == "payer@example.com", "amount + payer email forwarded")
    ok(sent[-1]["description"].startswith("AIdeazz"), "description forwarded (carries Ref <order id> on new links)")

    n = len(sent)
    espaluz = {"codOper": "LK-AAAABBBBCCCC", "status": 1, "authStatus": "00",
               "description": "EspaLuz Telegram  TG:123456  1 mes acceso", "totalPay": "7.0"}
    ok(s.intercept_service_webhook(espaluz) is None and len(sent) == n, "EspaLuz payment -> None, nothing forwarded")
    ok(s.intercept_service_webhook({"codOper": "LK-X", "status": 1}) is None and len(sent) == n, "no PARM_1, no description -> None")

    r = s.intercept_service_webhook({"PARM_1": "SVC:web_audit_prelim:ABCDEF", "codOper": "LK-Y", "status": 1, "authStatus": "00"})
    ok(r.get("processed") is True and sent[-1]["order_id"] == "ABCDEF", "PARM_1 SVC path unchanged")

    r = s.intercept_service_webhook(dict(paid, status=0, authStatus="05", messageSys="Declined"))
    ok(r.get("reason") == "not_approved", "declined AIdeazz payment is not forwarded as paid")

    # 29 Sep 2026: the receiver sent its own INTERNAL_WEBHOOK_SECRET -> every call 401.
    auth_seen.clear()
    r = s.intercept_service_webhook(paid)
    ok(r.get("processed") is True and auth_seen == ["Bearer cto-accepts"], "OUTREACH_SECRET (the shared one) is sent first")
    auth_seen.clear()
    with mock.patch.object(s, "_CTO_SECRETS", ["espaluz-own", "cto-accepts"]):
        r = s.intercept_service_webhook(paid)
    ok(r.get("processed") is True and len(auth_seen) == 2, "a 401 is retried once with the other secret")

print(f"\nforwarder: {fails} failed")
sys.exit(1 if fails else 0)
