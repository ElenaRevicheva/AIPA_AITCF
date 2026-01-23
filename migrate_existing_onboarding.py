#!/usr/bin/env python3
"""
Migrate existing onboarding data from JSON to unified PostgreSQL database.
Run once to sync all existing users.
"""

import json
import os
import sys

# Add the bot directory to path
sys.path.insert(0, '/home/ubuntu/EspaLuzFamilybot')

# Set database URL
os.environ['ESPALUZ_UNIFIED_DB_URL'] = 'postgresql://espaluz:EspaLuz2026!@localhost:5432/espaluz_unified'

from espaluz_memory import EspaLuzMemory

# Load existing onboarding data
ONBOARDING_FILE = '/home/ubuntu/EspaLuzFamilybot/user_onboarding.json'

print("=" * 60)
print("MIGRATING ONBOARDING DATA TO UNIFIED DATABASE")
print("=" * 60)

try:
    with open(ONBOARDING_FILE, 'r') as f:
        onboarding_data = json.load(f)
except FileNotFoundError:
    print(f"❌ File not found: {ONBOARDING_FILE}")
    sys.exit(1)

print(f"\nFound {len(onboarding_data)} users in onboarding file\n")

migrated = 0
skipped = 0

for user_id, data in onboarding_data.items():
    if data.get("step") != "complete":
        print(f"⏭️  Skipping {user_id} - onboarding not complete (step: {data.get('step')})")
        skipped += 1
        continue
    
    name = data.get("name")
    country = data.get("country")
    role = data.get("role", "expat")
    spouse = data.get("spouse")
    children = data.get("children", [])
    
    print(f"\n👤 User {user_id}:")
    print(f"   Name: {name}")
    print(f"   Country: {country}")
    print(f"   Role: {role}")
    if spouse:
        print(f"   Spouse: {spouse}")
    if children:
        for child in children:
            print(f"   Child: {child.get('name')}, age {child.get('age')}")
    
    try:
        # Create/update user in unified DB
        memory = EspaLuzMemory(platform='telegram', platform_user_id=str(user_id))
        
        # Update profile
        memory.update_user(
            display_name=name,
            current_country=country,
            user_type=role
        )
        
        # Store family as memories
        if spouse:
            memory.save_memory("family", f"Spouse: {spouse}", importance=8)
        
        if children:
            for child in children:
                child_name = child.get('name', 'Unknown')
                child_age = child.get('age', 0)
                memory.save_memory("family", f"Child: {child_name}, age {child_age}", importance=8)
        
        print(f"   ✅ Synced to unified DB!")
        migrated += 1
        
    except Exception as e:
        print(f"   ❌ Error: {e}")

print("\n" + "=" * 60)
print(f"MIGRATION COMPLETE")
print(f"  Migrated: {migrated}")
print(f"  Skipped:  {skipped}")
print("=" * 60)
