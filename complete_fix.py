#!/usr/bin/env python3

with open('src/atuona-creative-ai.ts', 'r') as f:
    content = f.read()

# Find the ENTIRE broken section and replace it completely
import re

# Pattern: Find from "// Remove old NFT card" to "if (true) {"
pattern = r'      // Remove old NFT card if exists \(for overwrite\).*?(?=\n      if \(true\) \{)'

# Clean working replacement
replacement = '''      // Remove old NFT card if exists (for overwrite)
      const cardMarker = `<div class="nft-id">#${pageId}</div>`;
      let cardIdx = htmlContent.indexOf(cardMarker);
      
      if (cardIdx !== -1) {
        console.log(`🔄 Found old card #${pageId} - removing`);
        let cardStart = htmlContent.lastIndexOf('<div class="nft-card">', cardIdx);
        let cardEnd = htmlContent.indexOf('<div class="nft-card">', cardStart + 50);
        if (cardEnd === -1) cardEnd = htmlContent.indexOf('</section>', cardStart);
        
        if (cardEnd > cardStart) {
          htmlContent = htmlContent.substring(0, cardStart) + htmlContent.substring(cardEnd);
          console.log(`✅ Removed old card #${pageId}`);
        }
      }

      // Remove old gallery slot
      const slotMarker = `<div class="slot-id">${pageId}</div>`;
      let slotIdx = htmlContent.indexOf(slotMarker);
      
      if (slotIdx !== -1) {
        console.log(`🔄 Found old slot #${pageId} - removing`);
        let slotStart = htmlContent.lastIndexOf('<div class="gallery-slot"', slotIdx);
        let depth = 0;
        let slotEnd = slotStart;
        
        for (let i = slotStart; i < htmlContent.length; i++) {
          if (htmlContent.substring(i, i + 5) === '<div ') depth++;
          if (htmlContent.substring(i, i + 6) === '</div>') {
            depth--;
            if (depth === 0) {
              slotEnd = i + 6;
              break;
            }
          }
        }
        
        if (slotEnd > slotStart) {
          htmlContent = htmlContent.substring(0, slotStart) + htmlContent.substring(slotEnd);
          console.log(`✅ Removed old slot #${pageId}`);
        }
      }

'''

# Replace
content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('src/atuona-creative-ai.ts', 'w') as f:
    f.write(content)

print("✅ Complete replacement done!")
