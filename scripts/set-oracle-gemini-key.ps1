# 8 Nov 2026 - put Elena's FREE-tier Gemini key (the one saved in Supabase as GEMINI_TTS_API_KEY) on Oracle for the
# EspaLuz Telegram and WhatsApp bots. Supabase never shows a secret's value back, so the key is pasted once here.
# The key is typed hidden, sent over ssh stdin (never on a command line, never printed, never in git), each .env is
# backed up first, and the script proves it is the SAME key as Supabase by comparing SHA-256 digests.
# Run:  powershell -ExecutionPolicy Bypass -File scripts\set-oracle-gemini-key.ps1

$supabaseDigest = "daf7efc61ecebc0e0ab0de34d9590da496cd39e4f50b3b9176eb97802fa651c2"  # `supabase secrets list` GEMINI_TTS_API_KEY

$secure = Read-Host "Paste the free Gemini key (hidden), then Enter" -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
if ($key.Length -lt 20) { Write-Host "That does not look like a key. Nothing changed."; exit 1 }

$sha = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($key))).Replace("-", "").ToLower()
if ($sha -ne $supabaseDigest) {
  Write-Host "This is NOT the same key as Supabase GEMINI_TTS_API_KEY (digest $($sha.Substring(0,8)) vs $($supabaseDigest.Substring(0,8)))."
  $go = Read-Host "Use it anyway? (yes/no)"
  if ($go -ne "yes") { Write-Host "Nothing changed."; exit 1 }
} else { Write-Host "Same key as Supabase GEMINI_TTS_API_KEY (digest $($sha.Substring(0,8)))." }

$remote = @'
import sys, os, shutil
key = sys.stdin.readline().strip()
for d in ("EspaLuzWhatsApp", "EspaLuzFamilybot"):
    p = os.path.expanduser(f"~/{d}/.env")
    shutil.copy2(p, p + ".bak-20261108-gemini")
    lines = open(p, encoding="utf-8").read().splitlines()
    out, done = [], False
    for l in lines:
        if l.startswith("GEMINI_API_KEY="):
            out.append("# replaced 8 Nov 2026 (prepaid key, 402): see .env.bak-20261108-gemini")
            out.append("GEMINI_API_KEY=" + key); done = True
        else:
            out.append(l)
    if not done:
        out.append("GEMINI_API_KEY=" + key)
    open(p, "w", encoding="utf-8").write("\n".join(out) + "\n")
    print(f"{d}: .env backed up and updated")
'@
$remote | ssh oracle-cto-aipa "cat > /tmp/setgem.py"
$key | ssh oracle-cto-aipa "python3 /tmp/setgem.py; rm -f /tmp/setgem.py; sudo systemctl restart espaluz-familybot espaluz-whatsapp; sleep 8; systemctl is-active espaluz-familybot espaluz-whatsapp"
$key = $null
Write-Host "Done. Tell Claude 'key set' - it will check that Gemini now answers."
