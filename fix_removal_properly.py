#!/usr/bin/env python3

with open('src/atuona-creative-ai.ts', 'r') as f:
    content = f.read()

# Find and replace the entire removal section with a MUCH simpler approach
# Look for the section starting with "// Remove old NFT card"

import re

# Find the location
pattern = r'(      // Remove old NFT card if exists.*?console\.log\(`🔄 Removed old gallery slot.*?\);)'

replacement = '''      // Remove old NFT card if exists (for overwrite)
      // Use simple string search and remove
      const cardMarker = `<div class="nft-id">#${pageId}</div>`;
      let cardStart = htmlContent.indexOf(cardMarker);
      
      if (cardStart !== -1) {
        console.log(`🔄 Found old NFT card #${pageId} - removing...`);
        
        // Go back to find the start of the nft-card div
        cardStart = htmlContent.lastIndexOf('<div class="nft-card">', cardStart);
        
        // Find the end: look for the next nft-card or end of section
        let cardEnd = htmlContent.indexOf('<div class="nft-card">', cardStart + 50);
        if (cardEnd === -1) {
          // It's the last card, look for section end or other marker
          cardEnd = htmlContent.indexOf('</div>\\n\\n                    <div class="nft-card"', cardStart + 50);
          if (cardEnd === -1) {
            cardEnd = htmlContent.indexOf('</section>', cardStart);
          }
        }
        
        if (cardEnd > cardStart) {
          const before = htmlContent.substring(0, cardStart);
          const after = htmlContent.substring(cardEnd);
          htmlContent = before + after;
          console.log(`✅ Removed old NFT card #${pageId}`);
        }
      } else {
        console.log(`📄 No old NFT card #${pageId} found (new card)`);
      }

      // Remove old gallery slot if exists (for overwrite)
      const slotMarker = `<div class="slot-id">${pageId}</div>`;
      let slotStart = htmlContent.indexOf(slotMarker);
      
      if (slotStart !== -1) {
        console.log(`🔄 Found old gallery slot #${pageId} - removing...`);
        
        // Go back to find the start of the gallery-slot div
        slotStart = htmlContent.lastIndexOf('<div class="gallery-slot"', slotStart);
        
        // Find the end: </div></div> - need to count depth
        let depth = 1;
        let slotEnd = slotStart;
        for (let i = slotStart + 25; i < htmlContent.length; i++) {
          if (htmlContent.substr(i, 5) === '<div ') depth++;
          if (htmlContent.substr(i, 6) === '</div>') {
            depth--;
            if (depth === 0) {
              slotEnd = i + 6;
              break;
            }
          }
        }
        
        if (slotEnd > slotStart) {
          const before = htmlContent.substring(0, slotStart);
          const after = htmlContent.substring(slotEnd);
          htmlContent = before + after;
          console.log(`✅ Removed old gallery slot #${pageId}`);
        }
      } else {
        console.log(`📄 No old gallery slot #${pageId} found (new slot)`);
      }'''

content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('src/atuona-creative-ai.ts', 'w') as f:
    f.write(content)

print("✅ Replaced removal logic with simpler version!")
