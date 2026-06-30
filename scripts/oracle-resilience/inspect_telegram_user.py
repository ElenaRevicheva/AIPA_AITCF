#!/usr/bin/env python3
"""Deep inspect a Telegram user memory stack."""
import os
import sys
import json

try:
    from dotenv import load_dotenv
    load_dotenv("/home/ubuntu/EspaLuzWhatsApp/.env")
except ImportError:
    pass

sys.path.insert(0, "/home/ubuntu/EspaLuzFamilybot")
sys.path.insert(0, "/home/ubuntu/EspaLuzWhatsApp")

import psycopg2
from espaluz_memory import EspaLuzMemory
from espaluz_rag import retrieve_context

TG = sys.argv[1] if len(sys.argv) > 1 else "5481526862"

mem = EspaLuzMemory(platform="telegram", platform_user_id=TG)
sid = mem.get_session_uuid(mem.user_id)
print(f"user telegram_id={TG} db_id={mem.user_id} session={sid[:12]}...")

if mem.chat_history:
    print(f"LangChain turns: {len(mem.chat_history.messages)}")
    for m in mem.chat_history.messages[-3:]:
        print(f"  {type(m).__name__}: {str(m.content)[:120]}...")
else:
    print("LangChain: None")

url = os.getenv("ESPALUZ_UNIFIED_DB_URL") or os.getenv("DATABASE_URL_UNIFIED")
conn = psycopg2.connect(url)
cur = conn.cursor()
cur.execute("SELECT COUNT(*) FROM espaluz_embeddings WHERE session_id=%s", (sid,))
print(f"RAG embeddings: {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM emotional_history WHERE user_id=%s", (mem.user_id,))
print(f"Emotional PG rows: {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM user_memories WHERE user_id=%s", (mem.user_id,))
print(f"User memory facts: {cur.fetchone()[0]}")
ctx = retrieve_context(sid, "Panama schools family relocation", top_k=3)
print(f"RAG retrieve len: {len(ctx or '')}")
if ctx:
    print(f"RAG sample: {ctx[:250]}...")

sess_path = "/home/ubuntu/EspaLuzFamilybot/user_sessions.json"
if os.path.exists(sess_path):
    sess = json.load(open(sess_path))
    if TG in sess:
        e = sess[TG].get("context", {}).get("emotional_state", {})
        print(f"Session JSON emotion: {e.get('current_emotion')} messages: {len(sess[TG].get('messages', []))}")
    else:
        print(f"user_sessions.json: {len(sess)} users, {TG} not in file")
conn.close()
