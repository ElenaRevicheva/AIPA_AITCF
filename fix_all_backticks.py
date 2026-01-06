#!/usr/bin/env python3
import re

with open('src/atuona-creative-ai.ts', 'r') as f:
    content = f.read()

# Find all console.log with backticks instead of parentheses
# Pattern: console.log`...`); should be console.log(`...`);
pattern = r'console\.log`([^`]+)`\);'
replacement = r'console.log(`\1`);'

fixed_content = re.sub(pattern, replacement, content)

# Count how many we fixed
import_count = len(re.findall(pattern, content))

with open('src/atuona-creative-ai.ts', 'w') as f:
    f.write(fixed_content)

print(f"✅ Fixed {import_count} console.log backtick errors!")
