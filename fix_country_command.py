#!/usr/bin/env python3
"""
Fix: /country command should handle multi-word country names like "El Salvador"
"""

with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'r') as f:
    content = f.read()

# Find the country command handler - it probably uses message.text.split()[1]
# We need to join all parts after /country

import re

# Pattern to find the country command handler
# Looking for something like: parts = message.text.split() and then parts[1]

# First, let's find how the /country command is handled
if '@bot.message_handler(commands=["country"])' in content:
    print("Found country command handler")
    
    # Find and fix the parsing logic
    # Old: country_name = message.text.split()[1].lower()
    # New: country_name = " ".join(message.text.split()[1:]).lower()
    
    old_pattern = 'country_name = message.text.split()[1].lower()'
    new_pattern = 'country_name = " ".join(message.text.split()[1:]).lower().replace(" ", "_")'
    
    if old_pattern in content:
        content = content.replace(old_pattern, new_pattern)
        print("✅ Fixed country command parsing for multi-word names")
    else:
        # Try alternative patterns
        old_pattern2 = 'parts[1].lower()'
        if old_pattern2 in content and 'country' in content[content.find(old_pattern2)-200:content.find(old_pattern2)]:
            print("Found alternative pattern")
        else:
            print("⚠️ Could not find exact parsing pattern - checking context")
            # Find the country command section
            match = re.search(r'@bot\.message_handler\(commands=\["country"\]\)[^@]+', content)
            if match:
                print(f"Country handler section found:\n{match.group()[:500]}...")

# Write the file
with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'w') as f:
    f.write(content)
