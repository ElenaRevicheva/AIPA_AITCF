#!/usr/bin/env python3

with open('src/atuona-creative-ai.ts', 'r') as f:
    content = f.read()

# Fix 1: Remove the check that prevents overwriting
# Change from: if (!htmlContent.includes(`nft-id">#${pageId}`)) {
# To: Remove/replace old card first, then add new one

old_code = '''      // Add NFT card to VAULT
      if (!htmlContent.includes(`nft-id">#${pageId}`)) {'''

new_code = '''      // Remove old NFT card if exists (for overwrite)
      const oldCardPattern = new RegExp(
        `<div class="nft-card">\\s*<div class="nft-header">\\s*<div class="nft-id">#${pageId}</div>[\\s\\S]*?</div>\\s*</div>\\s*</div>`,
        'g'
      );
      htmlContent = htmlContent.replace(oldCardPattern, '');
      console.log(`🔄 Removed old NFT card #${pageId} if existed`);
      
      // Add NFT card to VAULT
      if (true) {  // Always add (we removed old one above)'''

content = content.replace(old_code, new_code)

# Fix 2: Fix the backtick error
content = content.replace(
    "console.log`🎭 Atuona prepared NFT card #${pageId} for VAULT`);",
    "console.log(`🎭 Atuona prepared NFT card #${pageId} for VAULT`);"
)

# Fix 3: Also remove old gallery slot before adding new one
old_slot_code = '''      // Add gallery slot to MINT
      const newSlotHtml = `'''

new_slot_code = '''      // Remove old gallery slot if exists (for overwrite)
      const oldSlotPattern = new RegExp(
        `<div class="gallery-slot"[^>]*onclick="claimPoem\\(${pageNum},[\\s\\S]*?</div>\\s*</div>`,
        'g'
      );
      htmlContent = htmlContent.replace(oldSlotPattern, '');
      console.log(`🔄 Removed old gallery slot #${pageId} if existed`);
      
      // Add gallery slot to MINT
      const newSlotHtml = `'''

content = content.replace(old_slot_code, new_slot_code)

with open('src/atuona-creative-ai.ts', 'w') as f:
    f.write(content)

print("✅ Fixed HTML update logic!")
print("   - Removes old NFT card before adding new one")
print("   - Removes old gallery slot before adding new one")
print("   - Fixed console.log backtick error")
