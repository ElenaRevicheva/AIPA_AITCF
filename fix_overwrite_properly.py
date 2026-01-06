#!/usr/bin/env python3

with open('src/atuona-creative-ai.ts', 'r') as f:
    content = f.read()

# Find the broken removal section and replace with WORKING TypeScript
import re

# Find everything from "// Remove old NFT card" to just before "if (true) {"
pattern = r'      // Remove old NFT card if exists \(for overwrite\).*?(?=\n\n      if \(true\) \{)'

# Replace with working removal logic
replacement = '''      // Remove old NFT card if exists (for overwrite)
      try {
        const cardMarker = `<div class="nft-id">#${pageId}</div>`;
        const cardStartTag = '<div class="nft-card">';
        
        const markerPos = htmlContent.indexOf(cardMarker);
        if (markerPos !== -1) {
          console.log(`🔄 Found old NFT card #${pageId} at position ${markerPos}`);
          
          // Find start of card (search backwards)
          let cardStart = htmlContent.lastIndexOf(cardStartTag, markerPos);
          
          if (cardStart !== -1) {
            // Find end of card (next card or section end)
            let cardEnd = htmlContent.indexOf(cardStartTag, cardStart + 50);
            
            if (cardEnd === -1) {
              // Last card - search for section closing or other markers
              const markers = [
                '</div>\\n\\n                    <div class="nft-card">',
                '</div>\\n                </div>\\n            </section>',
                '</section>'
              ];
              
              for (const marker of markers) {
                const pos = htmlContent.indexOf(marker, cardStart + 50);
                if (pos !== -1) {
                  cardEnd = pos;
                  break;
                }
              }
            }
            
            if (cardEnd > cardStart) {
              const before = htmlContent.slice(0, cardStart);
              const after = htmlContent.slice(cardEnd);
              htmlContent = before + after;
              console.log(`✅ Removed old NFT card #${pageId}`);
            }
          }
        } else {
          console.log(`📄 No old NFT card #${pageId} found (new card)`);
        }
      } catch (error) {
        console.log(`⚠️ Error removing old NFT card: ${error}`);
      }

      // Remove old gallery slot if exists (for overwrite)
      try {
        const slotMarker = `<div class="slot-id">${pageId}</div>`;
        const slotStartTag = '<div class="gallery-slot"';
        
        const slotMarkerPos = htmlContent.indexOf(slotMarker);
        if (slotMarkerPos !== -1) {
          console.log(`🔄 Found old gallery slot #${pageId}`);
          
          // Find start of slot (search backwards)
          let slotStart = htmlContent.lastIndexOf(slotStartTag, slotMarkerPos);
          
          if (slotStart !== -1) {
            // Find matching closing tag by counting depth
            let depth = 0;
            let pos = slotStart;
            let slotEnd = -1;
            
            // Simple approach: find the closing </div></div> sequence
            // Gallery slots are: <div class="gallery-slot"><div class="slot-content">...</div></div>
            const searchText = htmlContent.slice(slotStart);
            let divCount = 0;
            let closeCount = 0;
            
            for (let i = 0; i < searchText.length - 6; i++) {
              if (searchText.slice(i, i + 5) === '<div ') {
                divCount++;
              } else if (searchText.slice(i, i + 6) === '</div>') {
                closeCount++;
                if (closeCount === divCount) {
                  slotEnd = slotStart + i + 6;
                  break;
                }
              }
            }
            
            if (slotEnd > slotStart) {
              const before = htmlContent.slice(0, slotStart);
              const after = htmlContent.slice(slotEnd);
              htmlContent = before + after;
              console.log(`✅ Removed old gallery slot #${pageId}`);
            }
          }
        } else {
          console.log(`📄 No old gallery slot #${pageId} found (new slot)`);
        }
      } catch (error) {
        console.log(`⚠️ Error removing old gallery slot: ${error}`);
      }'''

content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('src/atuona-creative-ai.ts', 'w') as f:
    f.write(content)

print("✅ Fixed removal logic with proper TypeScript!")
