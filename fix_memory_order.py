#!/usr/bin/env python3
"""
Fix: Correct argument order in save_memory calls and re-migrate family data
"""

import os
import sys

# Fix 1: Update main.py onboarding sync (fix argument order)
with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'r') as f:
    content = f.read()

# Wrong order: save_memory("family", f"Spouse: {family_members['spouse']}", ...)
# Right order: save_memory(f"Spouse: {family_members['spouse']}", "family", ...)

old_code = '''memory.save_memory("family", f"Spouse: {family_members['spouse']}", importance=8)'''
new_code = '''memory.save_memory(f"Spouse: {family_members['spouse']}", "family", importance=8)'''
content = content.replace(old_code, new_code)

old_code2 = '''memory.save_memory("family", f"Child: {child['name']}, age {child['age']}", importance=8)'''
new_code2 = '''memory.save_memory(f"Child: {child['name']}, age {child['age']}", "family", importance=8)'''
content = content.replace(old_code2, new_code2)

with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'w') as f:
    f.write(content)
print("✅ Fixed main.py save_memory argument order")

# Fix 2: Clear wrong memories and re-add correct ones
sys.path.insert(0, '/home/ubuntu/EspaLuzFamilybot')
os.environ['ESPALUZ_UNIFIED_DB_URL'] = 'postgresql://espaluz:EspaLuz2026!@localhost:5432/espaluz_unified'

import psycopg2

conn = psycopg2.connect('postgresql://espaluz:EspaLuz2026!@localhost:5432/espaluz_unified')
cur = conn.cursor()

# Delete wrong memories
cur.execute("DELETE FROM user_memories WHERE user_id = 14")
print(f"✅ Deleted {cur.rowcount} incorrect family memories")

# Insert correct ones
cur.execute("""
    INSERT INTO user_memories (user_id, memory_type, content, importance)
    VALUES 
        (14, 'family', 'Spouse: Married to Marshall', 8),
        (14, 'family', 'Child: Elena, age 40', 8)
""")
print("✅ Added correct family memories")

conn.commit()
cur.close()
conn.close()
print("✅ Migration fix complete!")
