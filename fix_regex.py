#!/usr/bin/env python3

with open('src/atuona-creative-ai.ts', 'r') as f:
    content = f.read()

# Find and fix the broken regex
old_regex = '''      const oldSlotPattern = new RegExp(
        `<div class="gallery-slot"[^>]*onclick="claimPoem\\(${pageNum},[\\s\\S]*?</div>\\s*</div>`,
        'g'
      );'''

new_regex = '''      const oldSlotPattern = new RegExp(
        `<div class="gallery-slot"[^>]*onclick="claimPoem\\\\(${pageNum},[\\\\s\\\\S]*?</div>\\\\s*</div>`,
        'g'
      );'''

content = content.replace(old_regex, new_regex)

with open('src/atuona-creative-ai.ts', 'w') as f:
    f.write(content)

print("✅ Fixed regex escaping!")
