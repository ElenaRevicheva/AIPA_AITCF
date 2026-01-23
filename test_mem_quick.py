#!/usr/bin/env python3
import os
os.chdir('/home/ubuntu/EspaLuzFamilybot')
import sys
sys.path.insert(0, '/home/ubuntu/EspaLuzFamilybot')

# Set env var if not set
if not os.getenv('DATABASE_URL_UNIFIED'):
    os.environ['DATABASE_URL_UNIFIED'] = 'postgresql://espaluz:EspaLuz2026!@localhost:5432/espaluz_unified'

from espaluz_memory import EspaLuzMemory, LANGCHAIN_AVAILABLE
print(f'LangChain available: {LANGCHAIN_AVAILABLE}')

mem = EspaLuzMemory(platform='telegram', platform_user_id='5481526862')
print(f'User ID: {mem.user_id}')
print(f'Total messages before: {mem.user.get("total_messages", 0)}')

mem.track_message()
print('Message tracked!')

if mem.chat_history:
    mem.chat_history.add_user_message('Test from CTO AIPA')
    mem.chat_history.add_ai_message('Response from EspaLuz')
    print('Chat history added!')
else:
    print('No chat_history available')

# Verify
import psycopg2
conn = psycopg2.connect(os.environ['DATABASE_URL_UNIFIED'])
cur = conn.cursor()
cur.execute("SELECT COUNT(*) FROM chat_message_history WHERE created_at > NOW() - INTERVAL '1 minute'")
print(f'New messages in last minute: {cur.fetchone()[0]}')
conn.close()
print('Done!')
