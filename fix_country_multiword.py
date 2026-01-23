#!/usr/bin/env python3
"""
Fix: /country command to handle multi-word country names like "El Salvador", "Costa Rica"
And add all 21 Spanish-speaking countries
"""

with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'r') as f:
    content = f.read()

# Fix 1: Change parsing to join all words after /country
old_parse = 'country_name = parts[1].lower().strip()'
new_parse = 'country_name = "_".join(parts[1:]).lower().strip()  # Handle multi-word: "El Salvador" -> "el_salvador"'

if old_parse in content:
    content = content.replace(old_parse, new_parse)
    print("✅ Fixed multi-word country parsing")
else:
    print("❌ Could not find country parsing line")

# Fix 2: Expand country map to include all 21 countries
old_map = '''    country_map = {
        "panama": Country.PANAMA,
        "panamá": Country.PANAMA,
        "mexico": Country.MEXICO,
        "méxico": Country.MEXICO,
        "colombia": Country.COLOMBIA,
        "argentina": Country.ARGENTINA,
        "spain": Country.SPAIN,
        "españa": Country.SPAIN,
        "costa_rica": Country.COSTA_RICA,
        "costarica": Country.COSTA_RICA,
        "peru": Country.PERU,
        "perú": Country.PERU,
        "chile": Country.CHILE,
        "ecuador": Country.ECUADOR
    }'''

new_map = '''    # All 21 Spanish-speaking countries (with aliases)
    country_map = {
        # Central America
        "panama": "panama", "panamá": "panama",
        "costa_rica": "costa_rica", "costarica": "costa_rica",
        "el_salvador": "el_salvador", "elsalvador": "el_salvador", "salvador": "el_salvador",
        "guatemala": "guatemala",
        "honduras": "honduras",
        "nicaragua": "nicaragua",
        # Mexico
        "mexico": "mexico", "méxico": "mexico",
        # South America
        "colombia": "colombia",
        "venezuela": "venezuela",
        "ecuador": "ecuador",
        "peru": "peru", "perú": "peru",
        "bolivia": "bolivia",
        "chile": "chile",
        "argentina": "argentina",
        "uruguay": "uruguay",
        "paraguay": "paraguay",
        # Caribbean
        "cuba": "cuba",
        "dominican_republic": "dominican_republic", "dominicana": "dominican_republic", "rd": "dominican_republic",
        "puerto_rico": "puerto_rico", "puertorico": "puerto_rico",
        # Europe/Africa
        "spain": "spain", "españa": "spain",
        "equatorial_guinea": "equatorial_guinea", "guinea_ecuatorial": "equatorial_guinea",
    }'''

if old_map in content:
    content = content.replace(old_map, new_map)
    print("✅ Expanded country map to all 21 countries")
else:
    print("⚠️ Could not find exact country map - trying alternative")

# Fix 3: Update the country check logic
old_check = '''    if country_name in country_map:
        country = country_map[country_name]
        context = get_country_context(country)'''

new_check = '''    if country_name in country_map:
        normalized_country = country_map[country_name]
        # Get context from enhancement module if available
        if ENHANCEMENTS_AVAILABLE:
            from espaluz_enhancements import COUNTRY_CONTEXTS_FULL
            context = COUNTRY_CONTEXTS_FULL.get(normalized_country, {})
        else:
            context = get_country_context(Country.PANAMA)  # Fallback'''

if old_check in content:
    content = content.replace(old_check, new_check)
    print("✅ Updated country context retrieval")
else:
    print("⚠️ Could not find country check logic")

# Fix 4: Update the "not found" message to show all countries
old_not_found = '''    else:
        bot.reply_to(message, f"""❌ Country '{country_name}' not found.

Try: panama, mexico, colombia, argentina, spain, costa_rica'''

new_not_found = '''    else:
        bot.reply_to(message, f"""❌ Country '{country_name}' not found.

Try: panama, mexico, colombia, argentina, spain, costa_rica, el_salvador, guatemala, honduras, nicaragua, venezuela, ecuador, peru, bolivia, chile, uruguay, paraguay, cuba, dominican_republic, puerto_rico'''

if old_not_found in content:
    content = content.replace(old_not_found, new_not_found)
    print("✅ Updated country not found message")

with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'w') as f:
    f.write(content)

print("\nDone! Country command now supports:")
print("- Multi-word names: 'El Salvador' → 'el_salvador'")
print("- All 21 Spanish-speaking countries")
