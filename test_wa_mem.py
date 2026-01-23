#!/usr/bin/env python3
import os
import sys
sys.path.insert(0, '/home/ubuntu/EspaLuzWhatsApp')
os.chdir('/home/ubuntu/EspaLuzWhatsApp')

from espaluz_memory import EspaLuzMemory, LANGCHAIN_AVAILABLE
print(f'LangChain: {LANGCHAIN_AVAILABLE}')

m = EspaLuzMemory(platform='whatsapp', platform_user_id='+50761666716')
print(f'User ID: {m.user_id}')
print(f'Chat history type: {type(m.chat_history)}')
print(f'Chat history: {m.chat_history}')

if m.chat_history:
    m.chat_history.add_user_message('Test from WhatsApp')
    m.chat_history.add_ai_message('WhatsApp response')
    print('Messages added to chat history!')
else:
    print('No chat_history - using add_message() instead')
    m.add_message('human', 'Test from WhatsApp')
    m.add_message('ai', 'WhatsApp response')
    print('Messages added via add_message()!')

# Check database
import psycopg2
db_url = os.getenv('DATABASE_URL_UNIFIED', 'postgresql://espaluz:EspaLuz2026!@localhost:5432/espaluz_unified')
conn = psycopg2.connect(db_url)
cur = conn.cursor()
cur.execute("SELECT COUNT(*) FROM chat_message_history WHERE created_at > NOW() - INTERVAL '2 minutes'")
print(f'New messages in last 2 min: {cur.fetchone()[0]}')
conn.close()
print('Done!')
