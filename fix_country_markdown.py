#!/usr/bin/env python3
"""Fix Markdown parsing error in /country command"""

with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'r') as f:
    content = f.read()

# Fix: Escape underscores in country name for Markdown
old_code = '''        response = f"""✅ *Country set: {context.get('flag', '')} {context.get('name', country_name.title())}*

💰 Currency: {context.get('currency', 'Local currency')}
🕐 Timezone: {context.get('timezone', 'Local time')}

I'll now use local vocabulary and expressions!

Try: /slang {country_name} to see local expressions."""
        bot.reply_to(message, response, parse_mode="Markdown")'''

new_code = '''        # Escape underscores for Markdown
        display_country = country_name.replace("_", " ").title()
        
        response = f"""✅ Country set: {context.get('flag', '')} {context.get('name', display_country)}

💰 Currency: {context.get('currency', 'Local currency')}
🕐 Timezone: {context.get('timezone', 'Local time')}

I'll now use local vocabulary and expressions!

Try: /slang to see local expressions."""
        bot.reply_to(message, response)'''

if old_code in content:
    content = content.replace(old_code, new_code)
    with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'w') as f:
        f.write(content)
    print("✅ Fixed country Markdown issue!")
else:
    print("❌ Could not find exact code block")
    # Try to find the problematic line
    if "Try: /slang {country_name}" in content:
        print("Found the slang line - attempting simpler fix")
        content = content.replace(
            'bot.reply_to(message, response, parse_mode="Markdown")',
            'bot.reply_to(message, response)',
            1  # Only first occurrence in country handler
        )
        # Actually we need more surgical approach
