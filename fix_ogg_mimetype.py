#!/usr/bin/env python3
"""Add OGG MIME type support to media serving"""

filepath = '/home/ubuntu/EspaLuzWhatsApp/espaluz_bridge.py'

with open(filepath, 'r') as f:
    content = f.read()

# Find and replace to add OGG support
old_code = """            # Determine content type based on file extension
            if filename.endswith('.mp3'):
                mimetype = 'audio/mpeg'
            elif filename.endswith('.mp4'):
                mimetype = 'video/mp4'
            else:
                mimetype = 'application/octet-stream'"""

new_code = """            # Determine content type based on file extension
            if filename.endswith('.mp3'):
                mimetype = 'audio/mpeg'
            elif filename.endswith('.ogg'):
                mimetype = 'audio/ogg'
            elif filename.endswith('.opus'):
                mimetype = 'audio/opus'
            elif filename.endswith('.mp4'):
                mimetype = 'video/mp4'
            elif filename.endswith('.wav'):
                mimetype = 'audio/wav'
            else:
                mimetype = 'application/octet-stream'"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open(filepath, 'w') as f:
        f.write(content)
    print('Added OGG/Opus MIME type support')
elif 'audio/ogg' in content:
    print('OGG MIME type already supported')
else:
    print('Could not find pattern to modify')
