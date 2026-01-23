#!/usr/bin/env python3
"""Fix Markdown parsing errors in /slang command"""

with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'r') as f:
    content = f.read()

# Fix slang handler - lines 3654 and 3659
# Remove parse_mode from slang responses
fixes = [
    ('bot.reply_to(message, slang_text, parse_mode="Markdown")', 
     'bot.reply_to(message, slang_text.replace("*", ""))'),
    ('bot.reply_to(message, response, parse_mode="Markdown")\n\n@bot.message_handler(commands=["org"])',
     'bot.reply_to(message, response.replace("*", ""))\n\n@bot.message_handler(commands=["org"])'),
]

fixed = 0
for old, new in fixes:
    if old in content:
        content = content.replace(old, new)
        fixed += 1
        print(f"✅ Fixed occurrence {fixed}")

if fixed > 0:
    with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'w') as f:
        f.write(content)
    print(f"✅ Fixed {fixed} Markdown issues in slang handler!")
else:
    print("❌ Could not find exact code blocks, trying alternative...")
    # More surgical fix - just for the slang handler
    import re
    # Find and fix slang handler specifically
    pattern = r"(def handle_slang.*?)(bot\.reply_to\(message, slang_text, parse_mode=\"Markdown\"\))"
    if re.search(pattern, content, re.DOTALL):
        content = re.sub(
            r'bot\.reply_to\(message, slang_text, parse_mode="Markdown"\)',
            'bot.reply_to(message, slang_text.replace("*", ""))',
            content,
            count=1
        )
        content = re.sub(
            r'(response = SLANG_PANAMA.*?bot\.reply_to\(message, response), parse_mode="Markdown"\)',
            r'\1.replace("*", ""))',
            content,
            flags=re.DOTALL
        )
        with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'w') as f:
            f.write(content)
        print("✅ Fixed with regex!")
