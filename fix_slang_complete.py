#!/usr/bin/env python3
"""
Complete fix for /slang command:
1. Handle multi-word country names
2. Use comprehensive data from espaluz_enhancements.py
3. Support all 21 countries
"""

with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'r') as f:
    content = f.read()

# Find and replace the entire slang handler
old_handler = '''@bot.message_handler(commands=["slang"])
def handle_slang(message):
    """Show local slang for a country"""
    if not ENHANCED_BRAIN_AVAILABLE:
        bot.reply_to(message, "Slang module not available.")
        return
    
    parts = message.text.split()
    if len(parts) > 1:
        country = parts[1].lower()
        slang_text = get_slang(country)
        bot.reply_to(message, slang_text)
    else:
        # Default to Panama, show available options
        response = SLANG_PANAMA + "\\n\\n💡 Other countries:\\n"
        response += "/slang mexico\\n/slang colombia\\n/slang argentina\\n/slang costa_rica"
        bot.reply_to(message, response)'''

new_handler = '''@bot.message_handler(commands=["slang"])
def handle_slang(message):
    """Show local slang for a country - supports all 21 Spanish-speaking countries"""
    if not ENHANCEMENTS_AVAILABLE:
        bot.reply_to(message, "Slang module not available.")
        return
    
    from espaluz_enhancements import COUNTRY_CONTEXTS_FULL
    
    parts = message.text.split()
    
    # Country aliases for common names
    country_aliases = {
        "el_salvador": "el_salvador", "elsalvador": "el_salvador", "salvador": "el_salvador",
        "costa_rica": "costa_rica", "costarica": "costa_rica",
        "dominican_republic": "dominican_republic", "dominicana": "dominican_republic", "dr": "dominican_republic",
        "puerto_rico": "puerto_rico", "puertorico": "puerto_rico", "pr": "puerto_rico",
        "equatorial_guinea": "equatorial_guinea", "guinea": "equatorial_guinea",
    }
    
    if len(parts) > 1:
        # Handle multi-word countries like "El Salvador"
        country_raw = "_".join(parts[1:]).lower().strip()
        country = country_aliases.get(country_raw, country_raw)
        
        if country in COUNTRY_CONTEXTS_FULL:
            ctx = COUNTRY_CONTEXTS_FULL[country]
            flag = ctx.get("flag", "")
            name = ctx.get("name", country.replace("_", " ").title())
            slang_list = ctx.get("slang", [])
            greeting = ctx.get("greeting", "¡Hola!")
            currency = ctx.get("currency", "Local currency")
            emergency = ctx.get("emergency", "911")
            
            response = f"{flag} SLANG & PRACTICALITIES: {name}\\n\\n"
            response += f"👋 Common greeting: {greeting}\\n\\n"
            response += "🗣️ Local slang:\\n"
            for word in slang_list:
                response += f"  • {word}\\n"
            response += f"\\n💰 Currency: {currency}"
            response += f"\\n📞 Emergency: {emergency}"
            response += "\\n\\n💡 Tip: Use these with locals to sound more natural!"
            
            bot.reply_to(message, response)
        else:
            # Country not found - show available options
            available = ", ".join(sorted(COUNTRY_CONTEXTS_FULL.keys())[:10])
            bot.reply_to(message, f"Country '{country_raw}' not found.\\n\\nAvailable: {available}...")
    else:
        # No country specified - use user's current country or show list
        user_id = str(message.from_user.id)
        user_country = "panama"  # Default
        if user_id in user_sessions:
            user_country = user_sessions[user_id]["context"]["user"]["preferences"].get("country", "panama")
        
        if user_country in COUNTRY_CONTEXTS_FULL:
            ctx = COUNTRY_CONTEXTS_FULL[user_country]
            flag = ctx.get("flag", "")
            name = ctx.get("name", user_country.replace("_", " ").title())
            slang_list = ctx.get("slang", [])
            greeting = ctx.get("greeting", "¡Hola!")
            currency = ctx.get("currency", "Local currency")
            
            response = f"{flag} SLANG & PRACTICALITIES: {name}\\n\\n"
            response += f"👋 Common greeting: {greeting}\\n\\n"
            response += "🗣️ Local slang:\\n"
            for word in slang_list:
                response += f"  • {word}\\n"
            response += f"\\n💰 Currency: {currency}"
            response += "\\n\\n💡 Other countries: /slang [country]\\n"
            response += "Examples: /slang mexico, /slang el salvador, /slang argentina"
            
            bot.reply_to(message, response)
        else:
            # Fallback - show list of countries
            countries = list(COUNTRY_CONTEXTS_FULL.keys())[:15]
            response = "🌎 Available slang for 21 countries!\\n\\n"
            response += "Usage: /slang [country]\\n\\n"
            response += "Examples:\\n"
            response += "• /slang mexico\\n"
            response += "• /slang el salvador\\n"
            response += "• /slang argentina\\n"
            response += "• /slang colombia\\n"
            response += "• /slang spain\\n"
            bot.reply_to(message, response)'''

if old_handler in content:
    content = content.replace(old_handler, new_handler)
    with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'w') as f:
        f.write(content)
    print("✅ Slang handler completely rewritten with 21-country support!")
else:
    print("❌ Could not find exact old handler - trying partial fix")
    # Try to just fix the country parsing
    if "country = parts[1].lower()" in content:
        content = content.replace(
            "country = parts[1].lower()",
            'country = "_".join(parts[1:]).lower().strip()'
        )
        with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'w') as f:
            f.write(content)
        print("✅ Fixed multi-word country parsing in slang")
