#!/usr/bin/env python3
"""Simple fix for slang Markdown"""

with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'r') as f:
    content = f.read()

# Fix 1: slang_text
old1 = 'bot.reply_to(message, slang_text, parse_mode="Markdown")'
new1 = 'bot.reply_to(message, slang_text)'

# Fix 2: response in slang (near SLANG_PANAMA)
old2 = '''        response = SLANG_PANAMA + "\\n\\n💡 *Other countries:*\\n"
        response += "/slang mexico\\n/slang colombia\\n/slang argentina\\n/slang costa_rica"
        bot.reply_to(message, response, parse_mode="Markdown")'''

new2 = '''        response = SLANG_PANAMA + "\\n\\n💡 Other countries:\\n"
        response += "/slang mexico\\n/slang colombia\\n/slang argentina\\n/slang costa_rica"
        bot.reply_to(message, response)'''

changes = 0

if old1 in content:
    content = content.replace(old1, new1)
    changes += 1
    print("✅ Fixed slang_text Markdown")

if old2 in content:
    content = content.replace(old2, new2)
    changes += 1
    print("✅ Fixed response Markdown")

if changes > 0:
    with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'w') as f:
        f.write(content)
    print(f"✅ Total fixes: {changes}")
else:
    print("❌ No exact matches found")
