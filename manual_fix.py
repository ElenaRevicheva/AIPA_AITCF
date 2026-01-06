#!/usr/bin/env python3

with open('src/atuona-creative-ai.ts', 'r') as f:
    lines = f.readlines()

# Find and fix line 1746 (index 1745)
if len(lines) > 1745:
    # The broken line has a literal newline in the string
    # Change it to escaped newline
    lines[1745] = "          cardEnd = htmlContent.indexOf('</div>\\n                    <div class=\"nft-card\"', cardStart + 50);\n"

with open('src/atuona-creative-ai.ts', 'w') as f:
    f.writelines(lines)

print("✅ Fixed line 1746!")
