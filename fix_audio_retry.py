import re

# Read the file
with open('/home/ubuntu/EspaLuzWhatsApp/espaluz_bridge.py', 'r') as f:
    content = f.read()

# Find and replace the audio download section (add retry logic)
old_code = '''            logging.info(f"📥 Downloading audio from authenticated URL...")
            download_response = requests.get(media_url, auth=auth, timeout=60)
            
            if download_response.status_code != 200:
                logging.error(f"Audio download failed: {download_response.status_code}")
                send_whatsapp_message(user_id, "❌ No pude descargar el audio. Could not download audio.")
                return'''

new_code = '''            logging.info(f"📥 Downloading audio from authenticated URL...")
            
            # RETRY LOGIC: Longer voice messages take time to be available on Twilio
            download_response = None
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    download_response = requests.get(media_url, auth=auth, timeout=90)
                    if download_response.status_code == 200:
                        logging.info(f"✅ Audio download succeeded on attempt {attempt + 1}")
                        break
                    elif download_response.status_code == 404 and attempt < max_retries - 1:
                        wait_time = (attempt + 1) * 3  # 3s, 6s, 9s
                        logging.warning(f"⏳ Audio not ready (404), waiting {wait_time}s before retry {attempt + 2}...")
                        time.sleep(wait_time)
                    else:
                        logging.warning(f"⚠️ Download attempt {attempt + 1} failed: {download_response.status_code}")
                except requests.exceptions.Timeout:
                    logging.warning(f"⏱️ Download timeout on attempt {attempt + 1}")
                    if attempt < max_retries - 1:
                        time.sleep(3)
            
            if not download_response or download_response.status_code != 200:
                status = download_response.status_code if download_response else "timeout"
                logging.error(f"Audio download failed after {max_retries} attempts: {status}")
                send_whatsapp_message(user_id, "❌ No pude descargar el audio. Could not download audio. Please try again.")
                return'''

if old_code in content:
    content = content.replace(old_code, new_code)
    with open('/home/ubuntu/EspaLuzWhatsApp/espaluz_bridge.py', 'w') as f:
        f.write(content)
    print("✅ Audio retry logic added successfully")
else:
    print("❌ Could not find the exact code block to replace")
    # Show what we're looking for
    if '📥 Downloading audio from authenticated URL' in content:
        print("Found the download message - checking for exact match...")
        # Find the line number
        lines = content.split('\n')
        for i, line in enumerate(lines):
            if '📥 Downloading audio from authenticated URL' in line:
                print(f"Line {i+1}: {line[:80]}...")
                for j in range(i, min(i+10, len(lines))):
                    print(f"  {j+1}: {lines[j]}")
