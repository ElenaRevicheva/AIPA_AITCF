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

os.environ.setdefault("INTERNAL_WEBHOOK_SECRET", "test")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "deploy", "espaluz-familybot"))
import aideazz_service_payments as s  # noqa: E402

sent = []
fails = 0


class _Resp:
    status_code = 200
    text = "{}"

    def json(self):
        return {"ok": True}


def _post(url, json=None, headers=None, timeout=None):
    sent.append(json)
    return _Resp()


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

print(f"\nforwarder: {fails} failed")
sys.exit(1 if fails else 0)
