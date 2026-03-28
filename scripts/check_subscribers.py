#!/usr/bin/env python3
"""Run on Oracle: cd /home/ubuntu/EspaLuzWhatsApp && ./venv/bin/python check_subscribers.py"""
import os
import sys
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)
os.chdir(script_dir)
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass
from user_trial_system import trial_system

print("DB URL set:", bool(os.getenv("ESPALUZ_UNIFIED_DB_URL") or os.getenv("DATABASE_URL_UNIFIED")))
s = trial_system._load_subscribers()
print("Subscribers keys:", list(s.keys()))
for e, i in s.items():
    print(" ", e, "-> whatsapp_id=", repr(i.get("whatsapp_id")), "status=", i.get("status"))
# Simulate mother's possible user_id formats
for uid in ["+50761968038", "50761968038", "+79001234567"]:
    st = trial_system._get_subscription_status(uid)
    print("_get_subscription_status(%r) ->" % uid, "has_subscription=", st.get("has_subscription"), "email=", st.get("email"))
