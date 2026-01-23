#!/usr/bin/env python3
"""
Add meanings to slang words for all 21 countries
"""

with open('/home/ubuntu/EspaLuzFamilybot/espaluz_enhancements.py', 'r') as f:
    content = f.read()

# Replace slang lists with dictionaries containing meanings
slang_replacements = {
    # Panama
    '"slang": ["xopa", "fren", "pela\'o", "chombo", "yeye", "juega vivo"]': 
    '"slang": {"xopa": "what\'s up", "fren": "friend/buddy", "pela\'o": "broke/no money", "chombo": "Afro-Panamanian (can be offensive)", "yeye": "fancy/posh", "juega vivo": "be street smart"}',
    
    # Costa Rica
    '"slang": ["pura vida", "mae", "tuanis", "tico/a", "chunche", "birra"]':
    '"slang": {"pura vida": "awesome/great/hello/goodbye (universal)", "mae": "dude/bro", "tuanis": "cool/nice", "tico/a": "Costa Rican person", "chunche": "thing/stuff", "birra": "beer"}',
    
    # Mexico
    '"slang": ["güey/wey", "chido", "neta", "órale", "chamba", "padre", "no manches"]':
    '"slang": {"güey/wey": "dude/bro", "chido": "cool/awesome", "neta": "really?/truth", "órale": "wow/ok/let\'s go", "chamba": "work/job", "padre": "cool/great", "no manches": "no way!/you\'re kidding"}',
    
    # Guatemala
    '"slang": ["qué onda", "canche", "patojo", "chilero", "shuco", "chapin"]':
    '"slang": {"qué onda": "what\'s up", "canche": "blonde person", "patojo": "kid/young person", "chilero": "cool/nice", "shuco": "dirty hot dog (street food)", "chapin": "Guatemalan person"}',
    
    # Honduras
    '"slang": ["maje", "catracho", "cipote", "alero", "cheque"]':
    '"slang": {"maje": "dude/buddy", "catracho": "Honduran person", "cipote": "kid/child", "alero": "close friend", "cheque": "ok/sure"}',
    
    # El Salvador
    '"slang": ["chivo", "bicho", "cipote", "chucho", "guanaco"]':
    '"slang": {"chivo": "cool/awesome", "bicho": "kid/dude", "cipote": "kid/child", "chucho": "dog/stingy person", "guanaco": "Salvadoran person"}',
    
    # Nicaragua
    '"slang": ["tuani", "nica", "maje", "chunche", "pinolero"]':
    '"slang": {"tuani": "cool/great", "nica": "Nicaraguan person", "maje": "dude/buddy", "chunche": "thing/stuff", "pinolero": "Nicaraguan (from pinol drink)"}',
    
    # Cuba
    '"slang": ["qué bolá", "asere", "yuma", "guagua", "fula", "paladar"]':
    '"slang": {"qué bolá": "what\'s up", "asere": "friend/buddy", "yuma": "foreigner/American", "guagua": "bus", "fula": "dollar/money", "paladar": "private restaurant"}',
    
    # Dominican Republic
    '"slang": ["klk", "tato", "vaina", "tigueraje", "jevi", "dique"]':
    '"slang": {"klk": "what\'s up (qué lo qué)", "tato": "ok/sure", "vaina": "thing/stuff/situation", "tigueraje": "street smarts/hustle", "jevi": "cool/heavy (from English)", "dique": "supposedly/apparently"}',
    
    # Puerto Rico
    '"slang": ["wepa", "brutal", "chavos", "janguear", "corillo", "boricua"]':
    '"slang": {"wepa": "wow!/yay!", "brutal": "awesome/amazing", "chavos": "money", "janguear": "hang out", "corillo": "friend group/crew", "boricua": "Puerto Rican person"}',
    
    # Colombia
    '"slang": ["parcero/parce", "bacano", "chévere", "berraco", "qué más", "listo"]':
    '"slang": {"parcero/parce": "buddy/friend", "bacano": "cool/awesome", "chévere": "great/nice", "berraco": "awesome/badass (or angry)", "qué más": "what\'s up", "listo": "ok/ready/smart"}',
    
    # Venezuela
    '"slang": ["pana", "chévere", "fino", "marico", "arrecho", "burda"]':
    '"slang": {"pana": "friend/buddy", "chévere": "cool/great", "fino": "great/perfect", "marico": "dude (casual, can be vulgar)", "arrecho": "angry/awesome", "burda": "a lot/very much"}',
    
    # Ecuador
    '"slang": ["ñaño/a", "chuchaqui", "bacán", "simon", "nel"]':
    '"slang": {"ñaño/a": "brother/sister/friend", "chuchaqui": "hangover", "bacán": "cool/awesome", "simon": "yes/yeah", "nel": "no/nope"}',
    
    # Peru
    '"slang": ["causa", "pata", "chévere", "jato", "bravazo", "al toque"]':
    '"slang": {"causa": "friend/buddy (also a dish)", "pata": "friend/buddy", "chévere": "cool/great", "jato": "house/home", "bravazo": "awesome/great", "al toque": "right away/immediately"}',
    
    # Bolivia
    '"slang": ["yapa", "chango", "jailón", "polera", "trufi"]':
    '"slang": {"yapa": "extra/bonus (free extra)", "chango": "kid/young person", "jailón": "snobby/posh person", "polera": "t-shirt", "trufi": "shared taxi"}',
    
    # Chile
    '"slang": ["po", "weón/weona", "cachai", "fome", "bacán", "al tiro"]':
    '"slang": {"po": "emphasis word (pues)", "weón/weona": "dude/friend (can be vulgar)", "cachai": "you know?/understand?", "fome": "boring/lame", "bacán": "cool/awesome", "al tiro": "right away"}',
    
    # Argentina
    '"slang": ["che", "boludo/a", "bárbaro", "quilombo", "morfar", "laburo", "bondi"]':
    '"slang": {"che": "hey/dude", "boludo/a": "dude/idiot (friendly)", "bárbaro": "great/awesome", "quilombo": "mess/chaos", "morfar": "to eat", "laburo": "work/job", "bondi": "bus"}',
    
    # Uruguay
    '"slang": ["bo", "ta", "championes", "celeste", "gurí", "botija"]':
    '"slang": {"bo": "hey/dude", "ta": "ok/yeah", "championes": "sneakers", "celeste": "light blue (national pride)", "gurí": "kid/child", "botija": "kid/buddy"}',
    
    # Paraguay
    '"slang": ["che", "mita\'i", "kuña", "karai", "guapo"]':
    '"slang": {"che": "hey/friend (Guaraní)", "mita\'i": "child (Guaraní)", "kuña": "woman (Guaraní)", "karai": "sir/mister (Guaraní)", "guapo": "hard-working/brave"}',
    
    # Spain
    '"slang": ["tío/tía", "mola", "guay", "currar", "flipar", "quedamos"]':
    '"slang": {"tío/tía": "dude/girl", "mola": "it\'s cool", "guay": "cool/great", "currar": "to work", "flipar": "to freak out/be amazed", "quedamos": "let\'s meet up"}',
}

changes = 0
for old, new in slang_replacements.items():
    if old in content:
        content = content.replace(old, new)
        changes += 1

if changes > 0:
    with open('/home/ubuntu/EspaLuzFamilybot/espaluz_enhancements.py', 'w') as f:
        f.write(content)
    print(f"✅ Added meanings to slang for {changes} countries!")
else:
    print("❌ No exact matches found")

# Now update the slang handler to display meanings properly
with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'r') as f:
    main_content = f.read()

# Update how slang is displayed
old_display = '''            response += "🗣️ Local slang:\\n"
            for word in slang_list:
                response += f"  • {word}\\n"'''

new_display = '''            response += "🗣️ Local slang:\\n"
            if isinstance(slang_list, dict):
                for word, meaning in slang_list.items():
                    response += f"  • {word} = {meaning}\\n"
            else:
                for word in slang_list:
                    response += f"  • {word}\\n"'''

if old_display in main_content:
    # Replace both occurrences (with country arg and without)
    main_content = main_content.replace(old_display, new_display)
    with open('/home/ubuntu/EspaLuzFamilybot/main.py', 'w') as f:
        f.write(main_content)
    print("✅ Updated slang display to show meanings!")
else:
    print("⚠️ Could not update slang display - may need manual fix")
