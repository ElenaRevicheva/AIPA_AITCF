#!/usr/bin/env python3
"""
Fix /family command to:
1. Update BOTH 'name' and 'user_name' so prompts use the correct name
2. Add age-appropriate response instructions to the prompt
"""

with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'r') as f:
    content = f.read()

# Fix 1: /family command should set user_name too
old_family = '''            user_sessions[user_id]["context"]["user"]["preferences"]["family_role"] = role.lower()
            user_sessions[user_id]["context"]["user"]["preferences"]["name"] = name.capitalize()
            user_sessions[user_id]["context"]["user"]["preferences"]["age"] = age'''

new_family = '''            user_sessions[user_id]["context"]["user"]["preferences"]["family_role"] = role.lower()
            user_sessions[user_id]["context"]["user"]["preferences"]["name"] = name.capitalize()
            user_sessions[user_id]["context"]["user"]["preferences"]["user_name"] = name.capitalize()  # Also update user_name for prompts!
            user_sessions[user_id]["context"]["user"]["preferences"]["age"] = age'''

if old_family in content:
    content = content.replace(old_family, new_family)
    print("✅ Fixed /family to update user_name")
else:
    print("❌ Could not find /family code")

# Fix 2: Add age-appropriate instructions to prompt
# Find where user_name is added to prompt and add age context
old_prompt = '''👤 USER: {user_name} from {user_country}'''
new_prompt = '''👤 USER: {user_name} from {user_country}
👶 AGE: {user_age} years old
🎭 ROLE: {user_role}'''

if old_prompt in content:
    content = content.replace(old_prompt, new_prompt)
    print("✅ Added age/role to prompt header")

# Fix 3: Add age retrieval near where user_name is retrieved
old_name_get = '''        user_name = session["context"]["user"]["preferences"].get("user_name") or session["context"]["user"].get("first_name")
        user_country = session["context"]["user"]["preferences"].get("country", "Panama").replace("_", " ").title()
        user_role = session["context"]["user"]["preferences"].get("family_role", "learner")'''

new_name_get = '''        user_name = session["context"]["user"]["preferences"].get("user_name") or session["context"]["user"].get("first_name")
        user_country = session["context"]["user"]["preferences"].get("country", "Panama").replace("_", " ").title()
        user_role = session["context"]["user"]["preferences"].get("family_role", "learner")
        user_age = session["context"]["user"]["preferences"].get("age", 30)  # Default adult age'''

if old_name_get in content:
    content = content.replace(old_name_get, new_name_get)
    print("✅ Added user_age retrieval")

# Fix 4: Add age-appropriate response instructions
old_instruction = '''⚠️ ALWAYS address them as "{user_name}" - NEVER say "friend" or "amigo"!'''

new_instruction = '''⚠️ ALWAYS address them as "{user_name}" - NEVER say "friend" or "amigo"!

🎯 AGE-APPROPRIATE RESPONSES:
- If age 0-6 (toddler/young child): Use VERY simple words, short sentences, playful tone, emojis, simple vocabulary (colores, animales, números). Make it FUN like talking to a preschooler!
- If age 7-12 (child): Use simple language, school-related vocab, games, stories. Keep it engaging and educational.
- If age 13-17 (teen): Use casual tone, relatable topics, social media references. Don't be condescending.
- If age 18+ (adult): Normal conversation, practical vocabulary, cultural context.

Current user {user_name} is {user_age} years old - ADAPT YOUR RESPONSE ACCORDINGLY!'''

if old_instruction in content:
    content = content.replace(old_instruction, new_instruction)
    print("✅ Added age-appropriate instructions")

with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'w') as f:
    f.write(content)
print("✅ All fixes applied!")
