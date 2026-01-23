#!/usr/bin/env python3
"""
Fix Atuona Creative AI:
1. Remove alcohol references from image prompts
2. Prioritize BOOK content over generic art in daily inspiration
3. Make knowledgebase actively used
"""

with open('/home/ubuntu/cto-aipa/src/atuona-creative-ai.ts', 'r') as f:
    content = f.read()

changes = 0

# ============================================================================
# FIX 1: Remove champagne/alcohol from image prompts
# ============================================================================
old_luxury = '''- Intimacy: tangled sheets, champagne, smudged eyeliner, borrowed shirt'''
new_luxury = '''- Intimacy: tangled sheets, morning light, smudged eyeliner, borrowed shirt'''

if old_luxury in content:
    content = content.replace(old_luxury, new_luxury)
    print("✅ Removed champagne from image prompt")
    changes += 1

# Add explicit NO ALCOHOL instruction to image prompts
old_dall = '''Return ONLY the optimized prompt, no explanation. Format for DALL-E 3.`;'''
new_dall = '''CRITICAL: NO alcohol, drinking, wine glasses, champagne, bottles, bars, or any substance use imagery. Kira is in recovery.

Return ONLY the optimized prompt, no explanation. Format for DALL-E 3.`;'''

if old_dall in content:
    content = content.replace(old_dall, new_dall)
    print("✅ Added NO ALCOHOL restriction to image prompts")
    changes += 1

# ============================================================================
# FIX 2: Change focus areas to use BOOK content, not generic Monet
# ============================================================================
old_focus = '''  // Time-based focus areas (kept from original)
  let focusArea = '';
  if (timeOfDay >= 5 && timeOfDay < 10) {
    focusArea = 'atuona gauguin morning light temetiu';
  } else if (timeOfDay >= 10 && timeOfDay < 14) {
    focusArea = 'fashion kira editor vogue auction ule';
  } else if (timeOfDay >= 14 && timeOfDay < 18) {
    focusArea = 'impressionist monet gauguin philosophy art';
  } else if (timeOfDay >= 18 && timeOfDay < 22) {
    focusArea = 'museum gallery exhibition nft blockchain deploy';
  } else {
    focusArea = 'recovery emotional family addiction healing';
  }'''

new_focus = '''  // Time-based focus areas - PRIORITIZE BOOK CONTENT over generic art
  let focusArea = '';
  if (timeOfDay >= 5 && timeOfDay < 10) {
    focusArea = 'atuona kira ule temetiu hiva oa marquesas yellow lilies mother';
  } else if (timeOfDay >= 10 && timeOfDay < 14) {
    focusArea = 'kira fashion editor vogue ule auction double life french snow';
  } else if (timeOfDay >= 14 && timeOfDay < 18) {
    focusArea = 'gauguin paradise lost painting atuona maurice morice maison du jouir';
  } else if (timeOfDay >= 18 && timeOfDay < 22) {
    focusArea = 'zver beast vibe coding elena panama technology soul blockchain';
  } else {
    focusArea = 'recovery damaged people silence cacophony family finding each other';
  }'''

if old_focus in content:
    content = content.replace(old_focus, new_focus)
    print("✅ Fixed focus areas to use BOOK content")
    changes += 1

# ============================================================================
# FIX 3: Add instruction to USE the knowledgebase actively
# ============================================================================
old_critical = '''CRITICAL REQUIREMENTS:
1. Your mood is ${selectedMood.toUpperCase()} - embody this fully, don't default to contemplative
2. Include at least one SPECIFIC detail from the knowledge (painting title, location, quote)
3. Follow the creative enhancement directive above
4. If there's a surprise connection from another domain - USE IT prominently
5. End differently based on mood (question for philosophical, image for contemplative, exclamation for celebratory, whisper for intimate)'''

new_critical = '''CRITICAL REQUIREMENTS:
1. Your mood is ${selectedMood.toUpperCase()} - embody this fully, don't default to contemplative
2. MANDATORY: Reference a SPECIFIC scene, character, or detail from the BOOK chapters above (Kira, Ule, yellow lilies, the flight, Alisa, Maurice Morice, the contract)
3. Follow the creative enhancement directive above
4. If there's a surprise connection from another domain - USE IT prominently
5. End differently based on mood (question for philosophical, image for contemplative, exclamation for celebratory, whisper for intimate)
6. AVOID: Generic art history (Monet water lilies, Van Gogh sunflowers) unless directly connected to a book scene
7. FOCUS ON: Elena's journey, Kira's search, Ule's silence, the Paradise quest, vibe coding as creation'''

if old_critical in content:
    content = content.replace(old_critical, new_critical)
    print("✅ Added BOOK-FIRST instructions")
    changes += 1

# ============================================================================
# FIX 4: Add recovery-safe context to ATUONA_CONTEXT
# ============================================================================
old_recovery = '''- Recovery as daily commit, not destination'''
new_recovery = '''- Recovery as daily commit, not destination
- IMPORTANT: Elena's family member (Kira) is in recovery from addiction - NEVER generate imagery or references to alcohol, drinking, wine glasses, champagne, bars, or substance use'''

if old_recovery in content:
    content = content.replace(old_recovery, new_recovery)
    print("✅ Added recovery-safe note to ATUONA_CONTEXT")
    changes += 1

# ============================================================================
# FIX 5: Ensure getRelevantKnowledge prioritizes book knowledge
# ============================================================================
# Find where knowledge triggers are defined and add book-specific triggers
old_triggers = '''    triggers: /monet|моне|renoir|ренуар|degas|дега|pissarro|писсарро|cézanne|сезанн|van gogh|ван гог|seurat|сёра|impressionis|импрессионис|water lil|кувшинк|starry night|звёздн|sunflower|подсолнух|giverny|живерни|post.?impressionis|постимпрессионис|pointillis|пуантилизм/i'''

new_triggers = '''    triggers: /monet|моне|renoir|ренуар|degas|дега|pissarro|писсарро|cézanne|сезанн|van gogh|ван гог|seurat|сёра|impressionis|импрессионис|starry night|звёздн|sunflower|подсолнух|giverny|живерни|post.?impressionis|постимпрессионис|pointillis|пуантилизм/i'''

# Remove "water lil|кувшинк" from generic impressionist triggers - we want to use book context instead

with open('/home/ubuntu/cto-aipa/src/atuona-creative-ai.ts', 'w') as f:
    f.write(content)

print(f"\n✅ Total changes applied: {changes}")
print("\n🔧 Summary:")
print("- Removed 'champagne' from luxury fashion layer")
print("- Added explicit NO ALCOHOL restriction to image prompts")
print("- Changed focus areas from generic Monet to BOOK scenes")
print("- Added BOOK-FIRST instructions to proactive messages")
print("- Added recovery-safe note about Kira")
