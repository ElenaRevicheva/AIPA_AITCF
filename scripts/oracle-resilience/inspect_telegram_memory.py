#!/usr/bin/env python3
"""Read-only Telegram memory stack inspection on Oracle."""
import os
import sys

try:
    from dotenv import load_dotenv
    load_dotenv("/home/ubuntu/EspaLuzWhatsApp/.env")
except ImportError:
    pass

url = os.getenv("ESPALUZ_UNIFIED_DB_URL") or os.getenv("DATABASE_URL_UNIFIED")
if not url:
    print("FAIL: no DB URL")
    sys.exit(1)

sys.path.insert(0, "/home/ubuntu/EspaLuzFamilybot")
sys.path.insert(0, "/home/ubuntu/EspaLuzWhatsApp")

import psycopg2
from espaluz_memory import EspaLuzMemory, LANGCHAIN_AVAILABLE

print("=== Telegram memory stack inspection ===")
print(f"LangChain available: {LANGCHAIN_AVAILABLE}")

conn = psycopg2.connect(url)
cur = conn.cursor()
cur.execute(
    "SELECT id, telegram_id, current_country, total_messages FROM users "
    "WHERE telegram_id IS NOT NULL ORDER BY updated_at DESC NULLS LAST LIMIT 5"
)
rows = cur.fetchall()
print(f"Telegram users in PG: {len(rows)} recent")
for r in rows:
    print(f"  user id={r[0]} telegram_id={r[1]} country={r[2]} msgs={r[3]}")

if not rows:
    print("No telegram users in unified DB yet")
    conn.close()
    sys.exit(0)

tg_id, db_id = rows[0][1], rows[0][0]
print(f"\n--- Deep inspect telegram_id={tg_id} (db id={db_id}) ---")

mem = EspaLuzMemory(platform="telegram", platform_user_id=str(tg_id))
print(f"EspaLuzMemory user_id: {mem.user_id}")
print(f"Session UUID: {mem.get_session_uuid(mem.user_id)}")

if mem.chat_history:
    msgs = mem.chat_history.messages[-5:]
    print(f"LangChain last {len(msgs)} turns:")
    for m in msgs:
        kind = "Human" if "Human" in type(m).__name__ else "AI"
        print(f"  {kind}: {str(m.content)[:120]}...")
else:
    print("WARN LangChain chat_history is None")

cur.execute(
    "SELECT COUNT(*) FROM chat_message_history WHERE session_id IN (%s, %s)",
    (mem.get_session_uuid(mem.user_id), mem.get_legacy_session_id(mem.user_id)),
)
print(f"PG chat_message_history rows (uuid+legacy): {cur.fetchone()[0]}")

cur.execute(
    "SELECT COUNT(*) FROM espaluz_embeddings WHERE session_id = %s",
    (mem.get_session_uuid(mem.user_id),),
)
print(f"RAG embeddings for session: {cur.fetchone()[0]}")

cur.execute(
    "SELECT COUNT(*) FROM emotional_history WHERE user_id = %s",
    (mem.user_id,),
)
print(f"Emotional history rows: {cur.fetchone()[0]}")

cur.execute(
    "SELECT COUNT(*) FROM user_memories WHERE user_id = %s",
    (mem.user_id,),
)
print(f"User memory facts: {cur.fetchone()[0]}")

try:
    from espaluz_rag import retrieve_context, get_session_id_for_user
    sid = get_session_id_for_user("telegram", mem.user_id)
    ctx = retrieve_context(sid, "schools Panama family", top_k=3)
    print(f"RAG retrieve test ({len(ctx)} chars): {ctx[:200] if ctx else '(empty)'}...")
except Exception as e:
    print(f"RAG retrieve test: {e}")

import json
from pathlib import Path
sess = Path("/home/ubuntu/EspaLuzFamilybot/user_sessions.json")
if sess.exists():
    data = json.loads(sess.read_text())
    print(f"user_sessions.json: {len(data)} users on disk")
    if str(tg_id) in data:
        s = data[str(tg_id)]
        emo = s.get("context", {}).get("emotional_state", {})
        print(f"  session emotional_state: {emo.get('current_emotion')} last={emo.get('last_emotions', [])[:3]}")
        print(f"  messages in session: {len(s.get('messages', []))}")
else:
    print("WARN user_sessions.json missing")

conn.close()
print("=== Done ===")
