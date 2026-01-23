#!/usr/bin/env python3
"""Fix slang display to show word + meaning"""

with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'r') as f:
    content = f.read()

# Fix the slang display - slang is a dict, not a list
old_display = '''            response = f"{flag} SLANG & PRACTICALITIES: {name}\\n\\n"
            response += f"👋 Common greeting: {greeting}\\n\\n"
            response += "🗣️ Local slang:\\n"
            for word in slang_list:
                response += f"  • {word}\\n"'''

new_display = '''            response = f"{flag} SLANG & PRACTICALITIES: {name}\\n\\n"
            response += f"👋 Common greeting: {greeting}\\n\\n"
            response += "🗣️ Local slang:\\n"
            # slang_list can be dict (word: meaning) or list (just words)
            if isinstance(slang_list, dict):
                for word, meaning in slang_list.items():
                    response += f"  • {word} = {meaning}\\n"
            else:
                for word in slang_list:
                    response += f"  • {word}\\n"'''

# Also fix the second occurrence (when no country specified)
old_display2 = '''            response += "🗣️ Local slang:\\n"
            for word in slang_list:
                response += f"  • {word}\\n"
            response += f"\\n💰 Currency: {currency}"
            response += "\\n\\n💡 Other countries'''

new_display2 = '''            response += "🗣️ Local slang:\\n"
            if isinstance(slang_list, dict):
                for word, meaning in slang_list.items():
                    response += f"  • {word} = {meaning}\\n"
            else:
                for word in slang_list:
                    response += f"  • {word}\\n"
            response += f"\\n💰 Currency: {currency}"
            response += "\\n\\n💡 Other countries'''

# Also fix emergency display (it's a dict, not string)
old_emergency = '''response += f"\\n📞 Emergency: {emergency}"'''
new_emergency = '''if isinstance(emergency, dict):
                response += f"\\n📞 Emergency: {emergency.get('police', '911')} (police), {emergency.get('ambulance', '911')} (ambulance)"
            else:
                response += f"\\n📞 Emergency: {emergency}"'''

changes = 0

if old_display in content:
    content = content.replace(old_display, new_display)
    changes += 1
    print("✅ Fixed first slang display")

if old_display2 in content:
    content = content.replace(old_display2, new_display2)
    changes += 1
    print("✅ Fixed second slang display")

if old_emergency in content:
    content = content.replace(old_emergency, new_emergency)
    changes += 1
    print("✅ Fixed emergency display")

if changes > 0:
    with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'w') as f:
        f.write(content)
    print(f"✅ Total fixes: {changes}")
else:
    print("❌ No matches found")
