#!/usr/bin/env python3
"""
Fix: Sync onboarding data to unified PostgreSQL database
This ensures user names, countries, and family info persist across sessions.
"""

import re

# Read the file
with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'r') as f:
    content = f.read()

# Find the finish_onboarding function and add DB sync after session update
old_code = '''    # Store family members
    family_members = {}
    if onboarding.get("spouse"):
        family_members["spouse"] = onboarding["spouse"]
    if onboarding.get("children"):
        family_members["children"] = onboarding["children"]
    prefs["family_members"] = family_members'''

new_code = '''    # Store family members
    family_members = {}
    if onboarding.get("spouse"):
        family_members["spouse"] = onboarding["spouse"]
    if onboarding.get("children"):
        family_members["children"] = onboarding["children"]
    prefs["family_members"] = family_members
    
    # === SYNC TO UNIFIED DATABASE (Fix: Jan 22, 2026) ===
    if UNIFIED_MEMORY_AVAILABLE:
        try:
            memory = EspaLuzMemory(platform='telegram', platform_user_id=str(user_id))
            # Update user profile with onboarding data
            memory.update_user(
                display_name=onboarding.get("name"),
                current_country=onboarding.get("country"),
                user_type=onboarding.get("role", "expat")
            )
            # Store family members in unified DB
            if family_members and (family_members.get("spouse") or family_members.get("children")):
                family_id = f"family_{user_id}"
                if family_members.get("spouse"):
                    memory.save_memory("family", f"Spouse: {family_members['spouse']}", importance=8)
                if family_members.get("children"):
                    for child in family_members["children"]:
                        memory.save_memory("family", f"Child: {child['name']}, age {child['age']}", importance=8)
            print(f"✅ Onboarding synced to unified DB: {onboarding.get('name')} from {onboarding.get('country')}")
        except Exception as e:
            print(f"⚠️ DB sync error (non-fatal): {e}")'''

if old_code in content:
    content = content.replace(old_code, new_code)
    with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'w') as f:
        f.write(content)
    print("✅ Onboarding sync to unified DB added!")
else:
    print("❌ Could not find the exact code block")
    # Debug: show what we're looking for
    if "Store family members" in content:
        print("Found 'Store family members' but exact match failed")
