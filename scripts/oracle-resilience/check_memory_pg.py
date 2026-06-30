#!/usr/bin/env python3
"""Read-only check: EspaLuz unified memory tables on Oracle."""
import os
import sys

try:
    from dotenv import load_dotenv
    load_dotenv("/home/ubuntu/EspaLuzWhatsApp/.env")
except ImportError:
    pass

url = os.getenv("ESPALUZ_UNIFIED_DB_URL") or os.getenv("DATABASE_URL_UNIFIED")
if not url:
    print("FAIL: no DB URL in env")
    sys.exit(1)

import psycopg2

conn = psycopg2.connect(url)
cur = conn.cursor()
for t in [
    "users",
    "chat_message_history",
    "user_memories",
    "emotional_history",
    "vocabulary",
    "espaluz_embeddings",
]:
    try:
        cur.execute("SELECT COUNT(*) FROM " + t)
        print(f"OK  {t}: {cur.fetchone()[0]} rows")
    except Exception as e:
        print(f"WARN  {t}: {e}")

cur.execute("SELECT COUNT(DISTINCT session_id) FROM chat_message_history")
print(f"OK  distinct chat sessions: {cur.fetchone()[0]}")

cur.execute(
    "SELECT display_name, whatsapp_id, telegram_id, current_country FROM users "
    "WHERE whatsapp_id IS NOT NULL OR telegram_id IS NOT NULL "
    "ORDER BY created_at DESC NULLS LAST LIMIT 3"
)
print("Recent users:")
for row in cur.fetchall():
    print("   ", row)

conn.close()
print("OK  PostgreSQL reachable")
