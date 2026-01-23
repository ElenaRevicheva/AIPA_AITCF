#!/usr/bin/env python3
"""Add delays between audio and video sends at all relevant locations"""

filepath = '/home/ubuntu/EspaLuzWhatsApp/espaluz_bridge.py'

with open(filepath, 'r') as f:
    content = f.read()

modifications = 0

# Pattern 1: After "Country-specific video sent" - need delay before next media
# Pattern 2: After any audio sent successfully before video - need delay

# Let's add delays after EVERY successful audio send to ensure video doesn't override
lines = content.split('\n')
new_lines = []

for i, line in enumerate(lines):
    new_lines.append(line)
    
    # Check if this is a successful audio send log line
    if ('audio sent' in line.lower() or '🎧' in line) and 'logging.info' in line:
        # Check if next line is NOT already a time.sleep
        if i + 1 < len(lines) and 'time.sleep' not in lines[i + 1]:
            indent = len(line) - len(line.lstrip())
            delay_line = ' ' * indent + 'time.sleep(3)  # Wait before sending video to prevent WhatsApp dropping messages'
            new_lines.append(delay_line)
            modifications += 1
            print(f'Added delay after line {i+1}: {line.strip()[:60]}...')

content = '\n'.join(new_lines)

with open(filepath, 'w') as f:
    f.write(content)

print(f'\n✅ Added {modifications} delays after audio sends')
