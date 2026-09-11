#!/usr/bin/env bash
# Diagnose EspaLuz Influencer → Make.com daily_promo from Oracle.
# Piped over SSH by .github/workflows/influencer-diag-on-trigger.yml.
# Prints to stdout (the only channel a cloud agent can read). Never prints secrets.
set -uo pipefail

MODE="${1:-diag}"
DIR=/home/ubuntu/EspaLuz_Influencer
OUT=/tmp/influencer-diag.txt
: > "$OUT"
exec > >(tee -a "$OUT") 2>&1

redact() {
  # Strip tokens, webhook paths, bearer secrets, emails-with-secrets, hex blobs.
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

echo "=== influencer-diag $(date -u +%Y-%m-%dT%H:%M:%SZ) mode=$MODE ==="
echo "host=$(hostname) user=$(whoami)"

echo
echo "=== 1. systemd espaluz-influencer ==="
systemctl is-active espaluz-influencer || true
systemctl show espaluz-influencer -p Id -p ActiveState -p SubState -p MainPID \
  -p ActiveEnterTimestamp -p EnvironmentFiles -p FragmentPath -p User 2>/dev/null || true
if [ -f /etc/systemd/system/espaluz-influencer.service ]; then
  echo "--- unit file (redacted) ---"
  redact < /etc/systemd/system/espaluz-influencer.service
elif [ -f /lib/systemd/system/espaluz-influencer.service ]; then
  echo "--- unit file (redacted) ---"
  redact < /lib/systemd/system/espaluz-influencer.service
else
  echo "NO unit file at /etc or /lib systemd path"
  systemctl cat espaluz-influencer 2>/dev/null | redact || true
fi

echo
echo "=== 2. process ==="
ps aux | grep -E '[P]ython|[p]ython.*[Ii]nfluencer|[m]ain.py' | grep -i -E 'influenc|EspaLuz_Influencer' || \
  ps aux | grep -E '[p]ython' | grep -i EspaLuz || echo "(no matching python process)"
if [ -d "$DIR" ]; then
  echo "DIR=$DIR exists"
  ls -la "$DIR" | head -40
else
  echo "FATAL: $DIR missing"
fi

echo
echo "=== 3. git (Influencer repo) ==="
if [ -d "$DIR/.git" ]; then
  (
    cd "$DIR"
    echo "branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
    echo "HEAD=$(git log -1 --format='%h %ci %s' 2>/dev/null)"
    echo "origin=$(git remote get-url origin 2>/dev/null | sed -E 's#https://[^@]+@#https://#; s#git@github.com:#https://github.com/#')"
    echo "--- status porcelain (first 30) ---"
    git status --porcelain | head -30
    echo "--- last 8 commits ---"
    git log --oneline -8
  )
else
  echo "no git in $DIR"
fi

echo
echo "=== 4. .env key NAMES (values never printed) ==="
if [ -f "$DIR/.env" ]; then
  echo "env_file=$DIR/.env mode=$(stat -c %a "$DIR/.env") size=$(stat -c %s "$DIR/.env")"
  echo "--- keys ---"
  grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$DIR/.env" | cut -d= -f1 | sort -u
  echo "--- webhook-ish keys present? ---"
  python3 - <<'PY'
import os, re
from pathlib import Path
p = Path("/home/ubuntu/EspaLuz_Influencer/.env")
text = p.read_text(encoding="utf-8", errors="replace")
keys = {}
for line in text.splitlines():
    line=line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k,v = line.split("=",1)
    keys[k.strip()] = v.strip().strip('"').strip("'")
needles = [k for k in keys if re.search(r'(MAKE|WEBHOOK|BUFFER|IMAGE|PROMO|CRM|HUBSPOT|OUTREACH)', k, re.I)]
print("matched_keys:", ", ".join(sorted(needles)) or "(none)")
for k in sorted(needles):
    v = keys[k]
    empty = "EMPTY" if not v else "SET"
    kind = "other"
    if "hook." in v or "make.com" in v:
        kind = "make-webhook-url"
    elif v.startswith("http"):
        kind = "http-url"
    elif v.lower().startswith("bearer "):
        kind = "bearer"
    print(f"  {k}: {empty} len={len(v)} kind={kind} prefix={v[:24].split('://')[0] if '://' in v else v[:4]+'…'}")
# also flag common names even if missing
for k in ["MAKE_WEBHOOK_URL","MAKE_WEBHOOK_URL_LINKEDIN","MAKE_COM_WEBHOOK","WEBHOOK_URL",
          "MAKE_WEBHOOK","BUFFER_WEBHOOK","INFLUENCER_MAKE_WEBHOOK","MAKE_HOOK_URL",
          "_CRM_HUB_URL","CRM_HUB_URL","OUTREACH_SECRET","_CRM_AUTH"]:
    if k not in keys:
        print(f"  MISSING {k}")
PY
else
  echo "NO .env at $DIR/.env"
fi

echo
echo "=== 5. main.py: promo / make / webhook / image (line hits, redacted) ==="
if [ -f "$DIR/main.py" ]; then
  echo "main.py bytes=$(stat -c %s "$DIR/main.py") mtime=$(stat -c %y "$DIR/main.py")"
  grep -n -E -i 'daily_promo|send_automated|MAKE_|webhook|imageURL|image_url|hook\.make|buffer|requests\.(post|get)|httpx|aiohttp|content_memory|marketing_engine|/daily_promo' \
    "$DIR/main.py" | redact | head -200
  echo "--- function defs ---"
  grep -n -E '^def |^async def ' "$DIR/main.py" | redact
else
  echo "NO main.py"
fi

echo
echo "=== 6. extract send_automated_daily_promo / webhook sender bodies ==="
python3 - <<'PY'
from pathlib import Path
import re, ast
p = Path("/home/ubuntu/EspaLuz_Influencer/main.py")
if not p.exists():
    print("no main.py"); raise SystemExit
src = p.read_text(encoding="utf-8", errors="replace")
# Find function names of interest
names = []
for m in re.finditer(r'^(async )?def ([A-Za-z0-9_]+)\(', src, re.M):
    n = m.group(2)
    if re.search(r'(promo|webhook|make|buffer|post_to|send_.*social|daily_)', n, re.I):
        names.append(n)
print("interesting_defs:", names)
# dump those functions (redact string literals that look secret)
try:
    tree = ast.parse(src)
except SyntaxError as e:
    print("AST parse failed:", e)
    tree = None

def redact_src(s: str) -> str:
    s = re.sub(r'https://hook\.[a-z0-9.-]*make\.com/[A-Za-z0-9_-]+', 'https://hook.make.com/[REDACTED]', s)
    s = re.sub(r'Bearer [A-Za-z0-9._+/=-]{8,}', 'Bearer [REDACTED]', s)
    s = re.sub(r'["\']sk-[A-Za-z0-9._-]{8,}["\']', '"[REDACTED_SK]"', s)
    s = re.sub(r'\b[0-9a-fA-F]{32,}\b', '[REDACTED_HEX]', s)
    s = re.sub(r'\d{8,}:[A-Za-z0-9_-]{20,}', '[REDACTED_TG_TOKEN]', s)
    return s

if tree:
    want = set(names) | {
        "send_automated_daily_promo","daily_promo","handle_daily_promo",
        "post_to_make","send_to_make","send_webhook","make_webhook",
        "build_image_url","get_daily_image"
    }
    dumped = 0
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in want:
            chunk = ast.get_source_segment(src, node) or ""
            print(f"\n----- {node.name} -----\n")
            print(redact_src(chunk)[:8000])
            dumped += 1
    if dumped == 0:
        print("(no matching function bodies — dumping os.getenv / requests.post windows)")
        for m in re.finditer(r'.{0,80}(os\.getenv|os\.environ|requests\.post|httpx\.post|aiohttp).{0,160}', src):
            print(redact_src(m.group(0)).replace("\n"," ")[:240])
else:
    print("falling back to regex windows")
    for pat in [r'send_automated_daily_promo', r'daily_promo', r'MAKE_', r'requests\.post']:
        print("PAT", pat)
PY

echo
echo "=== 7. other python files mentioning make/webhook/image ==="
if [ -d "$DIR" ]; then
  grep -RIn -E --include='*.py' 'hook\.make|MAKE_WEBHOOK|imageURL|send_automated_daily_promo|daily_promo' "$DIR" \
    --exclude-dir=.git --exclude-dir=__pycache__ --exclude-dir=.venv 2>/dev/null \
    | redact | head -80
fi

echo
echo "=== 8. image URL HTTP probes ==="
python3 - <<'PY'
from pathlib import Path
import re, json, os, subprocess, urllib.request, ssl
DIR = Path("/home/ubuntu/EspaLuz_Influencer")
urls = set()
# from python sources
for p in DIR.rglob("*.py"):
    if ".git" in p.parts or "__pycache__" in p.parts:
        continue
    try:
        t = p.read_text(encoding="utf-8", errors="replace")
    except Exception:
        continue
    for u in re.findall(r'https?://[^\s"\']+', t):
        if re.search(r'(jpg|jpeg|png|webp|gif|marketing_engine|image)', u, re.I):
            urls.add(u.rstrip("',)"))
# from json memory
for jp in [DIR/"content_memory.json", DIR/"data/content_memory.json"]:
    if jp.exists():
        try:
            data = json.loads(jp.read_text(encoding="utf-8", errors="replace"))
            blob = json.dumps(data)
            for u in re.findall(r'https?://[^\s"\']+', blob):
                urls.add(u.rstrip("',)"))
        except Exception as e:
            print("json parse", jp, e)
# well-known github raw patterns from docs
for extra in [
    "https://raw.githubusercontent.com/ElenaRevicheva/EspaLuz_Influencer/main/marketing_engine_images/me_29.jpg",
    "https://github.com/ElenaRevicheva/EspaLuz_Influencer/raw/main/marketing_engine_images/me_29.jpg",
]:
    urls.add(extra)
print(f"candidate_image_urls={len(urls)}")
ctx = ssl.create_default_context()
for u in sorted(urls)[:40]:
    try:
        req = urllib.request.Request(u, method="HEAD", headers={"User-Agent":"influencer-diag/1.0"})
        with urllib.request.urlopen(req, timeout=8, context=ctx) as r:
            print(f"  {r.status} len={r.headers.get('Content-Length')} type={r.headers.get('Content-Type')} {u[:140]}")
    except Exception as e:
        # try GET if HEAD fails
        try:
            req = urllib.request.Request(u, method="GET", headers={"User-Agent":"influencer-diag/1.0"})
            with urllib.request.urlopen(req, timeout=8, context=ctx) as r:
                print(f"  GET {r.status} len={r.headers.get('Content-Length')} type={r.headers.get('Content-Type')} {u[:140]}")
        except Exception as e2:
            print(f"  FAIL {type(e2).__name__}: {e2} :: {u[:140]}")
# local files
for dname in ["marketing_engine_images","assets","images","static"]:
    d = DIR/dname
    if d.is_dir():
        files = sorted(d.rglob("*"))
        print(f"local {dname}: {sum(1 for f in files if f.is_file())} files")
        for f in [x for x in files if x.is_file()][:8]:
            print(f"  {f.relative_to(DIR)} {f.stat().st_size}b")
PY

echo
echo "=== 9. content_memory.json shape ==="
python3 - <<'PY'
from pathlib import Path
import json
for jp in [Path("/home/ubuntu/EspaLuz_Influencer/content_memory.json"),
           Path("/home/ubuntu/EspaLuz_Influencer/data/content_memory.json")]:
    if not jp.exists():
        continue
    print("file", jp, "bytes", jp.stat().st_size)
    try:
        data = json.loads(jp.read_text(encoding="utf-8", errors="replace"))
    except Exception as e:
        print("parse fail", e); continue
    if isinstance(data, dict):
        print("keys:", sorted(data.keys())[:40])
        for k in ["marketing_image_rotation_index","last_milestone_influencer_post","last_promo","last_webhook","last_make"]:
            if k in data:
                v = data[k]
                s = str(v)
                if len(s)>200: s=s[:200]+"…"
                print(f"  {k}={s}")
    else:
        print("type", type(data).__name__, "len", len(data) if hasattr(data,'__len__') else "?")
PY

echo
echo "=== 10. journalctl espaluz-influencer (redacted, last 6h + around 20:27 UTC) ==="
echo "--- last 6 hours ---"
journalctl -u espaluz-influencer --since "6 hours ago" --no-pager -n 250 2>/dev/null | redact | tail -200
echo "--- window 2026-09-10 20:00-21:00 UTC (Elena /daily_promo ~20:27 UTC) ---"
journalctl -u espaluz-influencer --since "2026-09-10 20:00:00 UTC" --until "2026-09-10 21:00:00 UTC" --no-pager 2>/dev/null | redact | tail -150
echo "--- grep make/webhook/error/daily_promo today ---"
journalctl -u espaluz-influencer --since "2026-09-10 00:00:00 UTC" --no-pager 2>/dev/null \
  | grep -iE 'daily_promo|make\.com|webhook|error|fail|timeout|image|buffer|CRM signal|status' \
  | redact | tail -80

echo
echo "=== 11. python load of webhook env from the same .env the bot uses ==="
python3 - <<'PY'
from pathlib import Path
import re
p = Path("/home/ubuntu/EspaLuz_Influencer/.env")
src = Path("/home/ubuntu/EspaLuz_Influencer/main.py")
if not src.exists():
    raise SystemExit
text = src.read_text(encoding="utf-8", errors="replace")
# which env keys does the source actually read?
keys = sorted(set(re.findall(r"os\.getenv\(\s*['\"]([A-Za-z0-9_]+)", text)) |
              set(re.findall(r"os\.environ(?:\.get)?\[\s*['\"]([A-Za-z0-9_]+)", text)) |
              set(re.findall(r"os\.environ\.get\(\s*['\"]([A-Za-z0-9_]+)", text)))
print("os.getenv keys in main.py:", keys)
# load_dotenv?
print("load_dotenv calls:", len(re.findall(r'load_dotenv', text)))
print("dotenv.config / override:", "override" in text)
PY

echo
echo "=== 12. recent syslog / user logs mentioning influencer ==="
ls -lt "$DIR"/*.log 2>/dev/null | head -10 || true
ls -lt /home/ubuntu/.pm2/logs 2>/dev/null | head -5 || true
# some bots log next to the repo
if ls "$DIR"/*.log >/dev/null 2>&1; then
  for f in "$DIR"/*.log; do
    echo "--- tail $f ---"
    tail -n 40 "$f" | redact
  done
fi

echo
echo "=== DONE influencer-diag ==="
cp "$OUT" /tmp/influencer-diag-latest.txt
echo "wrote $OUT bytes=$(wc -c < "$OUT")"
