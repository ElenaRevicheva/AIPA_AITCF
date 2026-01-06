#!/usr/bin/env python3

with open('src/atuona-creative-ai.ts', 'r') as f:
    content = f.read()

# Fix the three broken lines
content = content.replace(
    "console.log`📄 Page ${pageId} exists - will OVERWRITE`);",
    "console.log(`📄 Page ${pageId} exists - will OVERWRITE`);"
)

content = content.replace(
    "await ctx.reply`⚠️ Page ${pageId} exists - OVERWRITING...`);",
    "await ctx.reply(`⚠️ Page ${pageId} exists - OVERWRITING...`);"
)

content = content.replace(
    "console.log`📄 Page ${pageId} doesn't exist - creating new`);",
    "console.log(`📄 Page ${pageId} doesn't exist - creating new`);"
)

with open('src/atuona-creative-ai.ts', 'w') as f:
    f.write(content)

print("✅ Fixed all backtick errors!")
