#!/usr/bin/env python3
"""Add delay between audio and video sends to prevent WhatsApp from dropping messages"""

import re

filepath = '/home/ubuntu/EspaLuzWhatsApp/espaluz_bridge.py'

with open(filepath, 'r') as f:
    content = f.read()

# Check if delay already exists
if 'time.sleep(3)  # Wait before sending video' in content:
    print('✅ Delay already exists')
    exit(0)

# Find the pattern after successful audio send and add delay
# Looking for the logging line followed by "else:"
old_text = '''logging.info(f"🎧 FULL country-specific audio sent for {detected_country} ({len(full_audio_text)} chars)")
                    else:'''

new_text = '''logging.info(f"🎧 FULL country-specific audio sent for {detected_country} ({len(full_audio_text)} chars)")
                        time.sleep(3)  # Wait before sending video to prevent WhatsApp dropping messages
                    else:'''

if old_text in content:
    content = content.replace(old_text, new_text)
    with open(filepath, 'w') as f:
        f.write(content)
    print('✅ Added 3-second delay after audio send')
else:
    # Try alternative pattern with different indentation
    print('Pattern not found with exact match, trying alternative...')
    
    # Search for the line and insert after it
    lines = content.split('\n')
    new_lines = []
    found = False
    
    for i, line in enumerate(lines):
        new_lines.append(line)
        if 'FULL country-specific audio sent' in line and not found:
            # Check indentation
            indent = len(line) - len(line.lstrip())
            new_lines.append(' ' * indent + 'time.sleep(3)  # Wait before sending video to prevent WhatsApp dropping messages')
            found = True
            print(f'Found pattern at line {i+1}')
    
    if found:
        content = '\n'.join(new_lines)
        with open(filepath, 'w') as f:
            f.write(content)
        print('✅ Added 3-second delay after audio send (alternative method)')
    else:
        print('❌ Could not find pattern to modify')
