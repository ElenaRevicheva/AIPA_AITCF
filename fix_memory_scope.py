#!/usr/bin/env python3
"""
Fix: Create memory instance BEFORE enhancement context block
The memory variable is used at line 1766 but created at line 3280
"""

with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'r') as f:
    content = f.read()

# Find the enhancement block and add memory creation before it
old_code = '''        # === ENHANCEMENT CONTEXT (8 Features - All 21 Countries) ===
        if ENHANCEMENTS_AVAILABLE and UNIFIED_MEMORY_AVAILABLE:
            try:
                user_country = session["context"]["user"]["preferences"].get("country", "panama")
                user_type_val = session["context"]["user"]["preferences"].get("user_type", "expat")
                learning_dir = session["context"]["user"]["preferences"].get("learning_direction", "spanish")
                
                enhancement_ctx = build_enhanced_context(
                    memory_instance=memory,'''

new_code = '''        # === ENHANCEMENT CONTEXT (8 Features - All 21 Countries) ===
        if ENHANCEMENTS_AVAILABLE and UNIFIED_MEMORY_AVAILABLE:
            try:
                # Create memory instance for this user
                memory = EspaLuzMemory(platform='telegram', platform_user_id=str(user_id))
                
                user_country = session["context"]["user"]["preferences"].get("country", "panama")
                user_type_val = session["context"]["user"]["preferences"].get("user_type", "expat")
                learning_dir = session["context"]["user"]["preferences"].get("learning_direction", "spanish")
                
                enhancement_ctx = build_enhanced_context(
                    memory_instance=memory,'''

if old_code in content:
    content = content.replace(old_code, new_code)
    with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'w') as f:
        f.write(content)
    print("✅ Fixed memory scope - now created before enhancement block")
else:
    print("❌ Could not find the enhancement block")
    # Debug
    if "ENHANCEMENT CONTEXT" in content:
        print("Found ENHANCEMENT CONTEXT but exact match failed")
