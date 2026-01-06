#!/usr/bin/env python3

with open('src/atuona-creative-ai.ts', 'r') as f:
    content = f.read()

import re

# Find and replace the broken section again, this time with proper escaped strings
pattern = r'      // Remove old NFT card if exists \(for overwrite\).*?(?=\n\n      if \(true\) \{)'

replacement = '''      // Remove old NFT card if exists (for overwrite)
      try {
        const cardMarker = `<div class="nft-id">#${pageId}</div>`;
        const cardStartTag = '<div class="nft-card">';
        
        const markerPos = htmlContent.indexOf(cardMarker);
        if (markerPos !== -1) {
          console.log(`🔄 Found old NFT card #${pageId}`);
          
          let cardStart = htmlContent.lastIndexOf(cardStartTag, markerPos);
          
          if (cardStart !== -1) {
            let cardEnd = htmlContent.indexOf(cardStartTag, cardStart + 50);
            
            if (cardEnd === -1) {
              cardEnd = htmlContent.indexOf('</section>', cardStart + 50);
            }
            
            if (cardEnd > cardStart) {
              htmlContent = htmlContent.substring(0, cardStart) + htmlContent.substring(cardEnd);
              console.log(`✅ Removed old NFT card #${pageId}`);
            }
          }
        }
      } catch (error) {
        console.log(`⚠️ Error removing NFT card: ${error}`);
      }

      // Remove old gallery slot if exists (for overwrite)
      try {
        const slotMarker = `<div class="slot-id">${pageId}</div>`;
        const slotStartTag = '<div class="gallery-slot"';
        
        const slotMarkerPos = htmlContent.indexOf(slotMarker);
        if (slotMarkerPos !== -1) {
          console.log(`🔄 Found old gallery slot #${pageId}`);
          
          let slotStart = htmlContent.lastIndexOf(slotStartTag, slotMarkerPos);
          
          if (slotStart !== -1) {
            let divCount = 0;
            let closeCount = 0;
            let slotEnd = -1;
            
            for (let i = slotStart; i < htmlContent.length - 6; i++) {
              const char5 = htmlContent.substring(i, i + 5);
              const char6 = htmlContent.substring(i, i + 6);
              
              if (char5 === '<div ') divCount++;
              if (char6 === '</div>') {
                closeCount++;
                if (closeCount === divCount) {
                  slotEnd = i + 6;
                  break;
                }
              }
            }
            
            if (slotEnd > slotStart) {
              htmlContent = htmlContent.substring(0, slotStart) + htmlContent.substring(slotEnd);
              console.log(`✅ Removed old gallery slot #${pageId}`);
            }
          }
        }
      } catch (error) {
        console.log(`⚠️ Error removing gallery slot: ${error}`);
      }'''

content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('src/atuona-creative-ai.ts', 'w') as f:
    f.write(content)

print("✅ Fixed with no string literal issues!")
