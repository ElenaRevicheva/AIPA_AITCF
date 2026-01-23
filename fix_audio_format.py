#!/usr/bin/env python3
"""Fix audio format for WhatsApp compatibility - convert to OGG with proper sample rate"""

filepath = '/home/ubuntu/EspaLuzWhatsApp/espaluz_bridge.py'

with open(filepath, 'r') as f:
    content = f.read()

# Find the send_whatsapp_media function and add audio conversion before sending
# We need to convert MP3 to OGG with proper sample rate

# Look for where audio is being prepared for sending
old_code = '''        logging.info(f"📤 Preparing to send {media_type} file ({file_size} bytes = {file_size/1024:.1f}KB)")'''

new_code = '''        # Convert audio to WhatsApp-compatible format (OGG with proper sample rate)
        if media_type == "audio" and file_path.endswith('.mp3'):
            try:
                ogg_path = file_path.replace('.mp3', '.ogg')
                convert_cmd = [
                    'ffmpeg', '-y', '-i', file_path,
                    '-ar', '48000',  # 48kHz sample rate
                    '-ac', '1',      # Mono
                    '-c:a', 'libopus',  # Opus codec (WhatsApp native)
                    '-b:a', '64k',   # Bitrate
                    ogg_path
                ]
                result = subprocess.run(convert_cmd, capture_output=True, text=True, timeout=60)
                if result.returncode == 0 and os.path.exists(ogg_path):
                    logging.info(f"✅ Audio converted to OGG: {file_path} → {ogg_path}")
                    # Use the OGG file instead
                    if os.path.exists(file_path):
                        os.remove(file_path)
                    file_path = ogg_path
                    file_size = os.path.getsize(file_path)
                else:
                    logging.warning(f"⚠️ Audio conversion failed, using original MP3: {result.stderr}")
            except Exception as e:
                logging.warning(f"⚠️ Audio conversion error, using original MP3: {e}")
        
        logging.info(f"📤 Preparing to send {media_type} file ({file_size} bytes = {file_size/1024:.1f}KB)")'''

if old_code in content:
    content = content.replace(old_code, new_code)
    with open(filepath, 'w') as f:
        f.write(content)
    print('✅ Added audio format conversion (MP3 → OGG with 48kHz)')
else:
    print('⚠️ Pattern not found - checking alternative')
    if 'Convert audio to WhatsApp-compatible format' in content:
        print('✅ Audio format conversion already added')
    else:
        print('❌ Could not find pattern to modify')
        # Show what we're looking for
        if 'Preparing to send' in content:
            print('Found "Preparing to send" in content, but not exact match')
