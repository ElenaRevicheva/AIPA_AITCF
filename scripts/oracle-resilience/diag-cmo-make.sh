#!/usr/bin/env bash
# Diagnose VJH CMO → Make.com scenario 3543445 (LinkedIn + Instagram / Buffer).
# Piped over SSH. Never prints secrets. Cloud agents read this log.
set -uo pipefail

MODE="${1:-cmo}"
DIR=/home/ubuntu/VibeJobHunterAIPA_AIMCF
OUT=/tmp/cmo-make-diag.txt
: > "$OUT"
exec > >(tee -a "$OUT") 2>&1

redact() {
  sed -E \
    -e 's#https://hook\.[a-z0-9.-]*make\.com/[A-Za-z0-9_-]+#https://hook.make.com/[REDACTED]#g' \
    -e 's#https://hooks\.zapier\.com/[^[:space:]"'\'']+#https://hooks.zapier.com/[REDACTED]#g' \
    -e 's#(Bearer[[:space:]]+)[A-Za-z0-9._+/=-]{8,}#\1[REDACTED]#g' \
    -e 's#(bot)[0-9]+:[A-Za-z0-9_-]+#\1[REDACTED]#g' \
    -e 's#\bsk-[A-Za-z0-9._-]{8,}#[REDACTED_SK]#g' \
    -e 's#\bgsk_[A-Za-z0-9._-]{8,}#[REDACTED_GSK]#g' \
    -e 's#\bxai-[A-Za-z0-9._-]{8,}#[REDACTED_XAI]#g' \
    -e 's#\bpat-[A-Za-z0-9._-]{8,}#[REDACTED_PAT]#g' \
    -e 's#\bghp_[A-Za-z0-9]{20,}#[REDACTED_GHP]#g' \
    -e 's#\bgithub_pat_[A-Za-z0-9_]{20,}#[REDACTED_GPAT]#g' \
    -e 's#\bAIza[A-Za-z0-9_-]{20,}#[REDACTED_GIZ]#g' \
    -e 's#\b[0-9a-fA-F]{32,}\b#[REDACTED_HEX]#g' \
    -e 's#(MAKE_[A-Z0-9_]*WEBHOOK[A-Z0-9_]*=).*#\1[REDACTED]#g' \
    -e 's#(WEBHOOK_URL=).*#\1[REDACTED]#g'
}

echo "=== cmo-make-diag $(date -u +%Y-%m-%dT%H:%M:%SZ) mode=$MODE ==="
echo "host=$(hostname) user=$(whoami)"
[ -d "$DIR" ] || { echo "FATAL: $DIR missing"; exit 1; }

echo
echo "=== 1. systemd vibejobhunter + vibejobhunter-web ==="
for u in vibejobhunter vibejobhunter-web; do
  echo "--- $u ---"
  systemctl is-active "$u" || true
  systemctl show "$u" -p Id -p ActiveState -p SubState -p MainPID \
    -p ActiveEnterTimestamp -p EnvironmentFiles -p FragmentPath -p User 2>/dev/null || true
done

echo
echo "=== 2. git ==="
(
  cd "$DIR"
  echo "branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
  echo "HEAD=$(git log -1 --format='%h %ci %s' 2>/dev/null)"
  echo "origin=$(git remote get-url origin 2>/dev/null | sed -E 's#https://[^@]+@#https://#; s#git@github[.]com:#https://github.com/#')"
  git status --porcelain | head -20
  echo "--- last 8 commits ---"
  git log --oneline -8
)

echo
echo "=== 3. .env key NAMES (values never printed) ==="
if [ -f "$DIR/.env" ]; then
  echo "env_file=$DIR/.env mode=$(stat -c %a "$DIR/.env") size=$(stat -c %s "$DIR/.env")"
  grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$DIR/.env" | cut -d= -f1 | sort -u
  python3 - <<'PY'
import re
from pathlib import Path
text = Path("/home/ubuntu/VibeJobHunterAIPA_AIMCF/.env").read_text(encoding="utf-8", errors="replace")
keys = {}
for line in text.splitlines():
    line=line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k,v = line.split("=",1)
    keys[k.strip()] = v.strip().strip('"').strip("'")
needles = [k for k in keys if re.search(r'(MAKE|WEBHOOK|BUFFER|IMAGE|CMO|LINKEDIN|INSTAGRAM|OUTREACH)', k, re.I)]
print("matched_keys:", ", ".join(sorted(needles)) or "(none)")
for k in sorted(needles):
    v = keys[k]
    empty = "EMPTY" if not v else "SET"
    kind = "other"
    if "hook." in v or "make.com" in v:
        kind = "make-webhook-url"
    elif v.startswith("http"):
        kind = "http-url"
    print(f"  {k}: {empty} len={len(v)} kind={kind}")
for k in ["MAKE_WEBHOOK_URL","MAKE_WEBHOOK_URL_LINKEDIN","MAKE_WEBHOOK_URL_INSTAGRAM",
          "MAKE_COM_WEBHOOK","WEBHOOK_URL","BUFFER_WEBHOOK"]:
    if k not in keys:
        print(f"  MISSING {k}")
PY
else
  echo "NO .env"
fi

echo
echo "=== 4. python files: make / buffer / imageURL / github raw ==="
grep -RIn -E --include='*.py' \
  'hook\.make|MAKE_WEBHOOK|imageURL|image_url|imageUrl|raw\.githubusercontent|github\.com/.*/raw/|linkedin_cmo|Instagram|Buffer' \
  "$DIR" --exclude-dir=.git --exclude-dir=__pycache__ --exclude-dir=.venv --exclude-dir=autonomous_data \
  2>/dev/null | redact | head -160

echo
echo "=== 5. dump CMO / Make payload builders ==="
python3 - <<'PY'
from pathlib import Path
import re, ast
DIR = Path("/home/ubuntu/VibeJobHunterAIPA_AIMCF")

def redact_src(s: str) -> str:
    s = re.sub(r'https://hook\.[a-z0-9.-]*make\.com/[A-Za-z0-9_-]+', 'https://hook.make.com/[REDACTED]', s)
    s = re.sub(r'Bearer [A-Za-z0-9._+/=-]{8,}', 'Bearer [REDACTED]', s)
    s = re.sub(r'["\']sk-[A-Za-z0-9._-]{8,}["\']', '"[REDACTED_SK]"', s)
    s = re.sub(r'\b[0-9a-fA-F]{32,}\b', '[REDACTED_HEX]', s)
    s = re.sub(r'\d{8,}:[A-Za-z0-9_-]{20,}', '[REDACTED_TG_TOKEN]', s)
    return s

want_name = re.compile(r'(linkedin|instagram|cmo|make|webhook|buffer|image|social|post_to)', re.I)
files = list(DIR.rglob("*.py"))
dumped = 0
for p in files:
    if any(x in p.parts for x in (".git", "__pycache__", ".venv", "autonomous_data")):
        continue
    try:
        src = p.read_text(encoding="utf-8", errors="replace")
        tree = ast.parse(src)
    except Exception:
        continue
    rel = str(p.relative_to(DIR))
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        if not want_name.search(node.name):
            continue
        if isinstance(node, ast.ClassDef):
            chunk = ast.get_source_segment(src, node) or ""
            print(f"\n----- CLASS {rel}:{node.name} ({len(chunk)} chars) -----\n")
            print(redact_src(chunk)[:6000])
            dumped += 1
            continue
        chunk = ast.get_source_segment(src, node) or ""
        # skip tiny helpers unless they mention make/image
        if len(chunk) < 80 and "make" not in chunk.lower() and "image" not in chunk.lower():
            continue
        print(f"\n----- {rel}:{node.name} -----\n")
        print(redact_src(chunk)[:8000])
        dumped += 1
print(f"\ndumped_functions={dumped}")

print("\n=== payload-key literals (image-ish) ===")
for p in files:
    if any(x in p.parts for x in (".git", "__pycache__", ".venv", "autonomous_data")):
        continue
    try:
        src = p.read_text(encoding="utf-8", errors="replace")
    except Exception:
        continue
    keys = re.findall(r'''['"]((?:image|photo|picture|media|pictureUrl|imageURL|imageUrl|image_url|photo_url|mediaUrl)[^'"]*)['"]''', src, re.I)
    if keys:
        print(p.relative_to(DIR), sorted(set(keys))[:20])

print("\n=== github raw / public prefixes in source ===")
raw_re = re.compile(r'https?://(?:raw\.githubusercontent\.com|github\.com)/[^\s"\']+')
pub_re = re.compile(r'https://webhook\.aideazz\.xyz/[^\s"\']+')
for p in files:
    if any(x in p.parts for x in (".git", "__pycache__", ".venv")):
        continue
    try:
        src = p.read_text(encoding="utf-8", errors="replace")
    except Exception:
        continue
    for u in sorted(set(raw_re.findall(src) + pub_re.findall(src))):
        print(f"  {p.relative_to(DIR)} :: {u[:180]}")
PY

echo
echo "=== 6. image URL HTTP probes (GitHub raw vs public CDN vs local files) ==="
python3 - <<'PY'
from pathlib import Path
import re, urllib.request, ssl, os
DIR = Path("/home/ubuntu/VibeJobHunterAIPA_AIMCF")
urls = set()
for p in DIR.rglob("*"):
    if any(x in p.parts for x in (".git", "__pycache__", ".venv", "autonomous_data", "node_modules")):
        continue
    if p.suffix.lower() not in {".py", ".json", ".md", ".env.example", ".yml", ".yaml"}:
        continue
    try:
        t = p.read_text(encoding="utf-8", errors="replace")
    except Exception:
        continue
    for u in re.findall(r'https?://[^\s"\']+', t):
        if re.search(r'(jpg|jpeg|png|webp|gif|marketing_engine|image|sprinter|assets/)', u, re.I):
            urls.add(u.rstrip("',)`"))
# well-known
urls.add("https://raw.githubusercontent.com/ElenaRevicheva/VibeJobHunterAIPA_AIMCF/main/sprinter.jpg")
urls.add("https://webhook.aideazz.xyz/influencer-images/marketing_engine_images/me_29.jpg")
print(f"candidate_image_urls={len(urls)}")
ctx = ssl.create_default_context()
for u in sorted(urls)[:50]:
    try:
        req = urllib.request.Request(u, method="GET", headers={"User-Agent":"cmo-diag/1.0"})
        with urllib.request.urlopen(req, timeout=10, context=ctx) as r:
            print(f"  GET {r.status} len={r.headers.get('Content-Length')} type={r.headers.get('Content-Type')} {u[:160]}")
    except Exception as e:
        print(f"  FAIL {type(e).__name__}: {str(e)[:160]} :: {u[:160]}")

print("\n--- local image files (depth<=3, not autonomous_data) ---")
n = 0
for p in DIR.rglob("*"):
    if any(x in p.parts for x in (".git", "__pycache__", ".venv", "autonomous_data", "node_modules")):
        continue
    if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        rel = p.relative_to(DIR)
        if len(rel.parts) > 3:
            continue
        print(f"  {rel} {p.stat().st_size}b")
        n += 1
        if n >= 40:
            print("  … truncated")
            break
print(f"listed={n}")
PY

echo
echo "=== 7. journalctl around Elena's 15:38 Panama = 20:38 UTC 10 Sep ==="
for u in vibejobhunter vibejobhunter-web; do
  echo "--- $u window 20:20-21:10 UTC ---"
  journalctl -u "$u" --since "2026-09-10 20:20:00 UTC" --until "2026-09-10 21:10:00 UTC" --no-pager 2>/dev/null \
    | redact | tail -120
  echo "--- $u grep make/buffer/image/instagram/linkedin today ---"
  journalctl -u "$u" --since "2026-09-10 00:00:00 UTC" --no-pager 2>/dev/null \
    | grep -iE 'make\.com|webhook|imageURL|image_url|instagram|linkedin|buffer|triggered|CMO|400|fail' \
    | redact | tail -60
done

echo
echo "=== 8. app log files ==="
ls -lt "$DIR"/logs 2>/dev/null | head -15 || true
find "$DIR" -maxdepth 2 -name '*.log' -type f 2>/dev/null | head -20
for f in "$DIR"/logs/vibejobhunter_*.log "$DIR"/logs/cmo*.log "$DIR"/logs/linkedin*.log; do
  [ -f "$f" ] || continue
  echo "--- tail $f ---"
  tail -n 80 "$f" | redact
done

echo
echo "=== DONE cmo-make-diag ==="
cp "$OUT" /tmp/cmo-make-diag-latest.txt
echo "wrote $OUT bytes=$(wc -c < "$OUT")"
