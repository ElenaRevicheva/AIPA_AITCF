#!/usr/bin/env python3

with open('src/atuona-creative-ai.ts', 'r') as f:
    content = f.read()

# Find the section to replace - look for the EXACT current code
import re

# The current broken code starts with "// Fetch current index.html"
# and includes the part where we add NFT cards

# Find where we need to insert removal logic - right before "if (htmlContent.includes..."
search_pattern = r'(\n)(      if \(htmlContent\.includes\(`<div class="nft-id">#\$\{pageId\}</div>`\)\) \{)'

# Insert removal code BEFORE the check
insertion = r'''\1      // ============ REMOVE OLD CARDS FIRST ============
      // Remove old NFT card from VAULT section
      const vaultCardId = `<div class="nft-id">#${pageId}</div>`;
      let vaultPos = htmlContent.indexOf(vaultCardId);
      
      if (vaultPos !== -1) {
        console.log(`🔄 Removing old NFT card #${pageId} from VAULT`);
        
        // Find card start
        let cardStart = vaultPos;
        while (cardStart > 0 && htmlContent.substring(cardStart - 22, cardStart) !== '<div class="nft-card">') {
          cardStart--;
        }
        cardStart = cardStart - 22;
        
        // Find card end (next card or section end)
        let cardEnd = htmlContent.indexOf('<div class="nft-card">', vaultPos + 50);
        if (cardEnd === -1) {
          cardEnd = htmlContent.indexOf('</section>', vaultPos);
        }
        
        if (cardEnd > cardStart && cardStart >= 0) {
          htmlContent = htmlContent.substring(0, cardStart) + htmlContent.substring(cardEnd);
          console.log(`✅ Removed old NFT card #${pageId}`);
        }
      }
      
      // Remove old gallery slot from MINT section
      const mintSlotId = `<div class="slot-id">${pageId}</div>`;
      let mintPos = htmlContent.indexOf(mintSlotId);
      
      if (mintPos !== -1) {
        console.log(`🔄 Removing old gallery slot #${pageId} from MINT`);
        
        // Find slot start
        let slotStart = mintPos;
        while (slotStart > 0 && htmlContent.substring(slotStart - 25, slotStart) !== '<div class="gallery-slot"') {
          slotStart--;
        }
        slotStart = slotStart - 25;
        
        // Find slot end by counting div depth
        let depth = 0;
        let slotEnd = slotStart;
        for (let i = slotStart; i < htmlContent.length - 6; i++) {
          if (htmlContent.substring(i, i + 5) === '<div ') {
            depth++;
          }
          if (htmlContent.substring(i, i + 6) === '</div>') {
            depth--;
            if (depth === 0) {
              slotEnd = i + 6;
              break;
            }
          }
        }
        
        if (slotEnd > slotStart && slotStart >= 0) {
          htmlContent = htmlContent.substring(0, slotStart) + htmlContent.substring(slotEnd);
          console.log(`✅ Removed old gallery slot #${pageId}`);
        }
      }
      // ============ END REMOVAL ============

\2'''

# Apply the replacement
content = re.sub(search_pattern, insertion, content)

with open('src/atuona-creative-ai.ts', 'w') as f:
    f.write(content)

print("✅ Inserted removal logic!")
