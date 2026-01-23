#!/usr/bin/env python3
import os
import sys
sys.path.insert(0, '/home/ubuntu/EspaLuzFamilybot')
os.chdir('/home/ubuntu/EspaLuzFamilybot')

from espaluz_memory import EspaLuzMemory, LANGCHAIN_AVAILABLE
print(f'LangChain available: {LANGCHAIN_AVAILABLE}')

# Test with user ID (like main.py calls it)
mem = EspaLuzMemory(platform='telegram', platform_user_id='5481526862')
print(f'User: {mem.user}')
print(f'User ID: {mem.user_id}')
print(f'Chat history: {mem.chat_history}')

# Track message
mem.track_message()
print('Message tracked!')

# Add to chat history
mem.add_message('human', 'Test from CTO at ' + str(__import__('datetime').datetime.now()))
mem.add_message('ai', 'Response from bot')
print('Messages added!')

# Track emotion
mem.track_emotion('happy', 'testing')
print('Emotion tracked!')

# Add vocabulary
mem.add_vocab('hola', 'hello', 'greeting')
print('Vocabulary added!')

# Verify in database
import psycopg2
db_url = os.getenv('DATABASE_URL_UNIFIED', 'postgresql://espaluz:EspaLuz2026!@localhost:5432/espaluz_unified')
conn = psycopg2.connect(db_url)
cur = conn.cursor()

cur.execute("SELECT COUNT(*) FROM chat_message_history WHERE created_at > NOW() - INTERVAL '2 minutes'")
print(f'New messages in last 2 min: {cur.fetchone()[0]}')

cur.execute("SELECT total_messages FROM users WHERE telegram_id = '5481526862'")
print(f'Total messages for user: {cur.fetchone()[0]}')

conn.close()
print('Done!')
